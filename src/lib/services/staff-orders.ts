import 'server-only';
import { Order, Table } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { unfinishedOrderStatuses, canTransition, statusChangeSchema } from '@/lib/order-flow';
import { objectIdSchema } from '@/lib/validators/common';
import { orderDto } from '@/lib/order-dto';
import { realtimeConfig, publishOrderChange } from '@/lib/realtime';
import { restaurantChannel } from '@/lib/realtime-channels';
import type { LiveOrdersSnapshot } from '@/types/live-orders';

export async function getRestaurantOrders(): Promise<LiveOrdersSnapshot> {
  const staff = await requireStaffApi();
  const scope = { restaurantId: staff.restaurantId };
  const [active, history] = await Promise.all([
    Order.find({ ...scope, status: { $in: unfinishedOrderStatuses } }).sort({ createdAt: 1, _id: 1 }).lean(),
    Order.find({ ...scope, status: { $in: ['READY', 'SERVED', 'CANCELLED'] } }).sort({ updatedAt: -1, _id: -1 }).limit(100).lean(),
  ]);
  const all = [...active, ...history];
  const tables = await Table.find({ ...scope, _id: { $in: all.map(order => order.tableId) } }).select('_id tableNumber').lean();
  const numbers = new Map(tables.map(table => [String(table._id), table.tableNumber]));
  return { fetchedAt: new Date().toISOString(), realtime: realtimeConfig(restaurantChannel(staff.restaurantId)), orders: all.map(order => ({ ...orderDto(order), ...(order.tableId ? { tableId: String(order.tableId) } : {}), ...(order.preparationBatchId ? { preparationBatchId: String(order.preparationBatchId) } : {}), tableNumber: numbers.get(String(order.tableId)) ?? null, tableSessionId: order.tableSessionId ? String(order.tableSessionId) : null, ...(order.fulfillmentType === 'TAKEAWAY' ? { takeawaySessionId: String(order.takeawaySessionId), customerName: order.customerName ?? '', customerPhone: order.customerPhone ?? '' } : {}), updatedAt: order.updatedAt.toISOString(), notes: order.notes })) };
}
export async function updateOrderStatus(id: string, payload: unknown) {
  const staff = await requireStaffApi();
  const parsed = statusChangeSchema.safeParse(payload);
  if (!objectIdSchema.safeParse(id).success || !parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const { expectedStatus, status } = parsed.data;
  if (!canTransition(expectedStatus, status)) throw new StaffApiError('INVALID_TRANSITION', 422);
  const scope = { _id: id, restaurantId: staff.restaurantId };
  const timestamps = { ACCEPTED: 'acceptedAt', PREPARING: 'preparingAt', READY: 'readyAt', SERVED: 'servedAt', CANCELLED: 'cancelledAt' } as const;
  const stamp = status === 'NEW' ? {} : { [timestamps[status]]: new Date() };
  const order = await Order.findOneAndUpdate({ ...scope, status: expectedStatus, preparationBatchId: { $exists: false } }, { $set: { status, ...stamp } }, { returnDocument: 'after', runValidators: true }).lean();
  if (!order) {
    if (!await Order.exists(scope)) throw new StaffApiError('NOT_FOUND', 404);
    throw new StaffApiError('CONFLICT', 409);
  }
  await publishOrderChange(staff.restaurantId, String(order.takeawaySessionId ?? order.tableSessionId), 'order.status.updated', order.fulfillmentType === 'TAKEAWAY' ? 'TAKEAWAY' : 'TABLE');
  return orderDto(order);
}
