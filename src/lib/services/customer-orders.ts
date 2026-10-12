import 'server-only';
import { priceOrder } from './order-pricing';
import mongoose from 'mongoose';
import { Order, TableSession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { orderInput } from '@/lib/validators/orders';
import { orderFingerprint } from '@/lib/customer-security';
import { CustomerRequestError, isDuplicateKey } from '@/lib/customer-errors';
import { credentialFilter, requireCustomerVisit, resolveCustomerTable } from './customer-session';
import { orderDto } from '@/lib/order-dto';
import { publishOrderChange, realtimeConfig } from '@/lib/realtime';
import { visitChannel } from '@/lib/realtime-channels';

const MAX_ORDERS_PER_VISIT = 100;

export async function getCustomerOrders(slug: string, tableValue: string, token?: string) {
  const target = await resolveCustomerTable(slug, tableValue);
  const visit = await requireCustomerVisit(target, token);
  const orders = await Order.find({ restaurantId: target.restaurant._id, tableId: target.table._id, tableSessionId: visit._id }).sort({ orderNumber: -1 }).lean();
  return { visitId: String(visit._id), orders: orders.map(orderDto), realtime: realtimeConfig(visitChannel(String(visit._id))) };
}

export async function submitCustomerOrder(slug: string, tableValue: string, token: string | undefined, payload: unknown) {
  const parsed = orderInput.safeParse(payload);
  if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
  const input = parsed.data;
  const fingerprint = orderFingerprint(input);
  await connectMongo();

  // Each transaction operation is awaited sequentially. Driver transaction retries
  // recheck credentials and idempotency; no cookies or external side effects occur here.
  const execute = () => mongoose.connection.transaction(async transaction => {
    const target = await resolveCustomerTable(slug, tableValue, transaction);
    const visit = await requireCustomerVisit(target, token, transaction);
    const scope = { restaurantId: target.restaurant._id, tableId: target.table._id, tableSessionId: visit._id };
    const existing = await Order.findOne({ ...scope, idempotencyKey: input.clientRequestId }).select('+requestFingerprint').session(transaction).lean();
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new CustomerRequestError('REQUEST_CONFLICT', 409);
      return { order: orderDto(existing), created: false, restaurantId: String(target.restaurant._id), visitId: String(visit._id) };
    }
    const { items, subtotal } = await priceOrder(input, target.restaurant._id, transaction);
    // Writing this same visit document serializes competing allocations and staff closure.
    const allocated = await TableSession.findOneAndUpdate({
      ...credentialFilter(target, token), _id: visit._id, status: 'ACTIVE', nextOrderNumber: { $lt: MAX_ORDERS_PER_VISIT },
    }, { $inc: { nextOrderNumber: 1 }, $set: { lastActivityAt: new Date() } }, { returnDocument: 'after', session: transaction }).select('nextOrderNumber').lean();
    if (!allocated) throw new CustomerRequestError(visit.nextOrderNumber >= MAX_ORDERS_PER_VISIT ? 'ORDER_LIMIT' : 'SESSION_CLOSED', 409);
    const [order] = await Order.create([{
      ...scope, idempotencyKey: input.clientRequestId, requestFingerprint: fingerprint,
      orderNumber: allocated.nextOrderNumber, status: 'NEW', currency: target.restaurant.currency, items, subtotal,
    }], { session: transaction });
    return { order: orderDto(order), created: true, restaurantId: String(target.restaurant._id), visitId: String(visit._id) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });

  let result;
  try { result = await execute(); }
  catch (error) {
    // A concurrent identical insert can surface E11000 rather than a retryable write
    // conflict. Start a fresh transaction so the winner is visible and reauthorize.
    if (isDuplicateKey(error)) result = await execute();
    else throw error;
  }
  // Runs only after transaction commit, never inside the retried transaction callback.
  if (result.created) await publishOrderChange(result.restaurantId, result.visitId, 'order.created');
  return result.order;
}
