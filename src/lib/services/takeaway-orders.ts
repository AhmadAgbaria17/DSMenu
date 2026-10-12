import 'server-only';
import mongoose from 'mongoose';
import { Order, TakeawaySession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { objectIdSchema } from '@/lib/validators/common';
import { orderInput } from '@/lib/validators/orders';
import { orderFingerprint } from '@/lib/customer-security';
import { CustomerRequestError, isDuplicateKey } from '@/lib/customer-errors';
import { orderDto } from '@/lib/order-dto';
import { realtimeConfig, publishOrderChange } from '@/lib/realtime';
import { takeawayChannel } from '@/lib/realtime-channels';
import { resolveTakeaway, requireTakeawayVisit, takeawayCredential } from './takeaway-session';
import { priceOrder } from './order-pricing';
import { requireTakeawayIndexes } from '@/lib/order-indexes';
export async function getTakeawayOrders(slug: string, token?: string) {
  const restaurant = await resolveTakeaway(slug); const visit = await requireTakeawayVisit(restaurant._id, token);
  const orders = await Order.find({ restaurantId: restaurant._id, takeawaySessionId: visit._id, fulfillmentType: 'TAKEAWAY' }).sort({ orderNumber: -1 }).lean();
  return { visitId: String(visit._id), orders: orders.map(orderDto), realtime: realtimeConfig(takeawayChannel(String(visit._id))) };
}
export async function submitTakeawayOrder(slug: string, token: string | undefined, payload: unknown) {
  const parsed = orderInput.extend({ takeawayVisitId: objectIdSchema }).safeParse(payload);
  if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
  const input = parsed.data; const fingerprint = orderFingerprint(input);
  await connectMongo(); await requireTakeawayIndexes();
  const execute = () => mongoose.connection.transaction(async transaction => {
    const restaurant = await resolveTakeaway(slug, transaction); const visit = await requireTakeawayVisit(restaurant._id, token, transaction);
    if (String(visit._id) !== input.takeawayVisitId) throw new CustomerRequestError('VISIT_CHANGED', 409);
    const scope = { restaurantId: restaurant._id, takeawaySessionId: visit._id, fulfillmentType: 'TAKEAWAY' as const };
    const existing = await Order.findOne({ ...scope, idempotencyKey: input.clientRequestId }).select('+requestFingerprint').session(transaction).lean();
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new CustomerRequestError('REQUEST_CONFLICT', 409);
      return { order: orderDto(existing), created: false, restaurantId: String(restaurant._id), visitId: String(visit._id) };
    }
    const { items, subtotal } = await priceOrder(input, restaurant._id, transaction);
    const allocated = await TakeawaySession.findOneAndUpdate({ ...takeawayCredential(restaurant._id, token), _id: visit._id, status: 'ACTIVE', nextOrderNumber: { $lt: 100 } }, { $inc: { nextOrderNumber: 1 }, $set: { lastActivityAt: new Date() } }, { session: transaction, returnDocument: 'after' }).lean();
    if (!allocated) throw new CustomerRequestError(visit.nextOrderNumber >= 100 ? 'ORDER_LIMIT' : 'SESSION_CLOSED', 409);
    const [order] = await Order.create([{ ...scope, customerName: visit.customerName, customerPhone: visit.customerPhone, idempotencyKey: input.clientRequestId, requestFingerprint: fingerprint, orderNumber: allocated.nextOrderNumber, status: 'NEW', currency: restaurant.currency, items, subtotal }], { session: transaction });
    return { order: orderDto(order), created: true, restaurantId: String(restaurant._id), visitId: String(visit._id) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10000 });
  let result;
  try { result = await execute(); } catch (error) { if (isDuplicateKey(error)) result = await execute(); else throw error; }
  if (result.created) await publishOrderChange(result.restaurantId, result.visitId, 'order.created', 'TAKEAWAY');
  return result.order;
}
