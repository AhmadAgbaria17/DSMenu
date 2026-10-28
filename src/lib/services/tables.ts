import 'server-only';
import { closeEmptyTableSessions } from './empty-table-sessions';
import mongoose from 'mongoose';
import { Table, TableSession, Order, ServiceCall, Restaurant } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { createTableInput, editTableInput, closeTableInput, tableState } from '@/lib/validators/tables';
import { objectIdSchema } from '@/lib/validators/common';
import { unfinishedOrderStatuses } from '@/lib/order-flow';
import { isDuplicateKey } from '@/lib/customer-errors';
import { appOrigin } from '@/lib/env';
import { tableQrUrl } from '@/lib/qr';
import { invalidateMenu } from './menu-management';
import { readSessionBill } from './table-bill';
import type { TableSnapshot } from '@/types/tables';

export async function getManagedTables(): Promise<TableSnapshot> {
  const staff = await requireStaffApi(); const scope = { restaurantId: staff.restaurantId };
  await closeEmptyTableSessions(scope);
  const [restaurant, tables, visits, orders, calls] = await Promise.all([
    Restaurant.findById(staff.restaurantId).select('name slug logo').lean().orFail(),
    Table.find(scope).sort({ tableNumber: 1 }).lean(),
    TableSession.find({ ...scope, status: 'ACTIVE' }).select('_id tableId createdAt').lean(),
    Order.find({ ...scope, status: { $in: unfinishedOrderStatuses } }).select('tableSessionId').lean(),
    ServiceCall.find({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }).select('tableSessionId').lean(),
  ]);
  const count = (rows: { tableSessionId?: mongoose.Types.ObjectId | null }[]) => {
    const map = new Map<string, number>();
    for (const row of rows) { const key = String(row.tableSessionId); map.set(key, (map.get(key) ?? 0) + 1); }
    return map;
  };
  const orderCounts = count(orders); const callCounts = count(calls);
  const byTable = new Map(visits.map(v => [String(v.tableId), v]));
  return { restaurant: { name: restaurant.name, slug: restaurant.slug, logo: restaurant.logo?.url ?? null }, tables: tables.map(table => {
    const visit = byTable.get(String(table._id)); const id = visit ? String(visit._id) : '';
    return { id: String(table._id), tableNumber: table.tableNumber, label: table.label ?? '', isActive: table.isActive, state: tableState(table.isActive, !!visit), qrUrl: tableQrUrl(appOrigin(), restaurant.slug, table.tableNumber), visit: visit ? { id, openedAt: visit.createdAt.toISOString(), activeOrders: orderCounts.get(id) ?? 0, unresolvedCalls: callCounts.get(id) ?? 0 } : null };
  }) };
}
export async function createTable(payload: unknown) {
  const staff = await requireStaffApi(); const parsed = createTableInput.safeParse(payload);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  try {
    const table = await Table.create({ ...parsed.data, restaurantId: staff.restaurantId });
    await invalidateMenu(staff.restaurantId); return { id: String(table._id) };
  } catch (error) { if (isDuplicateKey(error)) throw new StaffApiError('TABLE_EXISTS', 409); throw error; }
}
export async function editTable(id: string, payload: unknown) {
  const staff = await requireStaffApi(); const parsed = editTableInput.safeParse(payload);
  if (!objectIdSchema.safeParse(id).success || !parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  await mongoose.connection.transaction(async session => {
    const table = await Table.findOneAndUpdate({ _id: id, restaurantId: staff.restaurantId }, { $inc: { lifecycleVersion: 1 } }, { session, returnDocument: 'after' });
    if (!table) throw new StaffApiError('NOT_FOUND', 404);
    if (!parsed.data.isActive && await TableSession.exists({ restaurantId: staff.restaurantId, tableId: id, status: 'ACTIVE' }).session(session)) throw new StaffApiError('ACTIVE_VISIT', 409);
    await Table.updateOne({ _id: id, restaurantId: staff.restaurantId }, { $set: parsed.data }, { session, runValidators: true });
  });
  await invalidateMenu(staff.restaurantId); return { id };
}
export async function closeTableVisit(id: string, payload: unknown) {
  const staff = await requireStaffApi(); const parsed = closeTableInput.safeParse(payload);
  if (!objectIdSchema.safeParse(id).success || !parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  await mongoose.connection.transaction(async session => {
    const table = await Table.findOneAndUpdate({ _id: id, restaurantId: staff.restaurantId }, { $inc: { lifecycleVersion: 1 } }, { session });
    if (!table) throw new StaffApiError('NOT_FOUND', 404);
    // The visit write conflicts with order/service creation. Transaction retries see
    // committed requests before allowing closure; a stale ID cannot close a new visit.
    const visit = await TableSession.findOneAndUpdate({ _id: parsed.data.sessionId, restaurantId: staff.restaurantId, tableId: id, status: 'ACTIVE' }, { $set: { status: 'CLOSED', closedAt: new Date(), closeReason: 'MANUAL' } }, { session });
    if (!visit) throw new StaffApiError('CONFLICT', 409);
    const bill = await readSessionBill(staff.restaurantId, id, parsed.data.sessionId, session);
    if (bill.activeOrders) throw new StaffApiError('ACTIVE_ORDERS', 409);
    if (bill.unresolvedCalls) throw new StaffApiError('UNRESOLVED_CALLS', 409);
    // A revision is only a stale-review guard, never an authoritative client total.
    if (parsed.data.billRevision && parsed.data.billRevision !== bill.revision) throw new StaffApiError('CONFLICT', 409);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  await invalidateMenu(staff.restaurantId); return { closed: true };
}
export async function getTableQr(id: string) {
  const staff = await requireStaffApi();
  if (!objectIdSchema.safeParse(id).success) throw new StaffApiError('INVALID_REQUEST', 400);
  const table = await Table.findOne({ _id: id, restaurantId: staff.restaurantId, isActive: true }).lean();
  if (!table) throw new StaffApiError('NOT_FOUND', 404);
  const restaurant = await Restaurant.findById(staff.restaurantId).select('slug').lean().orFail();
  return { url: tableQrUrl(appOrigin(), restaurant.slug, table.tableNumber), filename: `${restaurant.slug}-table-${table.tableNumber}-qr.png` };
}
