import 'server-only';
import mongoose, { type ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import { Table, TableSession, Restaurant, Order, ServiceCall } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { objectIdSchema } from '@/lib/validators/common';
import { orderDto } from '@/lib/order-dto';
import { summarizeBill } from '@/lib/table-bill';
import type { TableSessionBill } from '@/types/table-bill';

// Internal helper: the caller supplies only a restaurant ID obtained from staff auth.
export async function readSessionBill(restaurantId: string, tableId: string, sessionId: string, transaction: ClientSession): Promise<TableSessionBill> {
  const table = await Table.findOne({ _id: tableId, restaurantId }).session(transaction).lean();
  if (!table) throw new StaffApiError('NOT_FOUND', 404);
  const visit = await TableSession.findOne({ _id: sessionId, tableId, restaurantId }).session(transaction).lean();
  if (!visit) throw new StaffApiError('NOT_FOUND', 404);
  const restaurant = await Restaurant.findById(restaurantId).select('name').session(transaction).lean().orFail();
  const scope = { restaurantId, tableId, tableSessionId: sessionId };
  const stored = await Order.find(scope).sort({ orderNumber: 1, _id: 1 }).session(transaction).lean();
  const orders = stored.map(order => ({ ...orderDto(order), notes: order.notes }));
  const unresolvedCalls = await ServiceCall.countDocuments({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }).session(transaction);
  const summary = summarizeBill(orders);
  const status = visit.status as 'ACTIVE' | 'CLOSED';
  return {
    restaurantName: restaurant.name, tableNumber: table.tableNumber, sessionId,
    openedAt: visit.createdAt.toISOString(), status, closedAt: visit.closedAt?.toISOString() ?? null,
    orders, ...summary, unresolvedCalls,
    canClose: status === 'ACTIVE' && summary.activeOrders === 0 && unresolvedCalls === 0,
    revision: createHash('sha256').update(JSON.stringify({ sessionId, orders, unresolvedCalls })).digest('hex'),
  };
}
export async function getTableSessionBill(tableId: string, sessionId: string) {
  const staff = await requireStaffApi();
  if (!objectIdSchema.safeParse(tableId).success || !objectIdSchema.safeParse(sessionId).success) throw new StaffApiError('NOT_FOUND', 404);
  return mongoose.connection.transaction(transaction => readSessionBill(staff.restaurantId, tableId, sessionId, transaction), { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
}
