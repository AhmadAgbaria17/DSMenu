import 'server-only';
import mongoose, { type ClientSession } from 'mongoose';
import { KitchenPrintState, Order, Restaurant, Table } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { kitchenUnitSchema, kitchenPrintInput, type KitchenUnit, type KitchenPrintMetadata } from '@/lib/kitchen-print';
import { isDuplicateKey } from '@/lib/customer-errors';
import type { KitchenTicket } from '@/types/kitchen-ticket';

async function preparingOrders(restaurantId: string, unit: KitchenUnit, session: ClientSession | null = null) {
  const orders = await Order.find({ restaurantId, ...(unit.kind === 'batch'
    ? { preparationBatchId: unit.id }
    : { _id: unit.id, preparationBatchId: { $exists: false } }) }).sort({ orderNumber: 1, _id: 1 }).session(session).lean();
  if (!orders.length) throw new StaffApiError('NOT_FOUND', 404);
  if (orders.some(order => order.status !== 'PREPARING')) throw new StaffApiError('CONFLICT', 409);
  if (unit.kind === 'batch' && orders.some(order => order.fulfillmentType === 'TAKEAWAY' || !order.tableSessionId || !order.tableId || String(order.tableSessionId) !== String(orders[0].tableSessionId) || String(order.tableId) !== String(orders[0].tableId))) throw new StaffApiError('CONFLICT', 409);
  return orders;
}
const metadata = (state: { kitchenPrintCount: number; kitchenPrintedAt: Date } | null): KitchenPrintMetadata => ({ count: state?.kitchenPrintCount ?? 0, printedAt: state?.kitchenPrintedAt.toISOString() ?? null });

export async function getKitchenTicket(input: unknown): Promise<KitchenTicket> {
  const staff = await requireStaffApi();
  const parsed = kitchenUnitSchema.safeParse(input);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const unit = parsed.data;
  const orders = await preparingOrders(staff.restaurantId, unit);
  const [restaurant, table, state] = await Promise.all([
    Restaurant.findById(staff.restaurantId).select('name').lean().orFail(),
    orders[0].tableId ? Table.findOne({ _id: orders[0].tableId, restaurantId: staff.restaurantId }).select('tableNumber').lean() : null,
    KitchenPrintState.findOne({ restaurantId: staff.restaurantId, unitType: unit.kind, unitId: unit.id }).lean(),
  ]);
  const names = (value: { nameAr: string; nameHe: string; nameEn: string }) => ({ nameAr: value.nameAr, nameHe: value.nameHe, nameEn: value.nameEn });
  return {
    unit, restaurantId: staff.restaurantId, restaurantName: restaurant.name,
    tableNumber: table?.tableNumber ?? null,
    fulfillmentType: orders[0].fulfillmentType === 'TAKEAWAY' ? 'TAKEAWAY' : 'TABLE',
    customerName: orders[0].fulfillmentType === 'TAKEAWAY' ? orders[0].customerName ?? '' : null,
    preparedAt: (orders[0].preparingAt ?? orders[0].createdAt).toISOString(),
    print: metadata(state),
    orders: orders.map(order => ({ orderNumber: order.orderNumber, notes: order.notes, items: order.items.map(item => ({
      ...names(item), quantity: item.quantity, note: item.notes,
      options: (item.optionGroups ?? []).map(group => ({ ...names(group), selected: group.selected.map(names), removed: group.removed.map(names) })),
    })) })),
  };
}

export async function recordKitchenPrint(input: unknown, payload: unknown): Promise<KitchenPrintMetadata> {
  const staff = await requireStaffApi();
  const parsed = kitchenUnitSchema.safeParse(input); const body = kitchenPrintInput.safeParse(payload);
  if (!parsed.success || !body.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const unit = parsed.data; const { expectedCount, requestId } = body.data;
  const scope = { restaurantId: staff.restaurantId, unitType: unit.kind, unitId: unit.id };
  const indexes = await KitchenPrintState.collection.indexes();
  if (!indexes.some(index => index.name === 'kitchen_print_unit' && index.unique)) throw new Error('Apply kitchen print indexes before printing.');
  const execute = () => mongoose.connection.transaction(async session => {
    const orders = await preparingOrders(staff.restaurantId, unit, session);
    const current = await KitchenPrintState.findOne(scope).select('+lastRequestId').session(session).lean();
    // A retry of the same initiated print must not count as an intentional reprint.
    if (current?.lastRequestId === requestId && current.kitchenPrintCount === expectedCount + 1) return metadata(current);
    if ((current?.kitchenPrintCount ?? 0) !== expectedCount) throw new StaffApiError('CONFLICT', 409);
    // Serialize against Ready/closure without changing order timestamps, status,
    // snapshots or billing/analytics data. Transaction retries recheck PREPARING.
    const locked = await Order.updateMany({ restaurantId: staff.restaurantId, _id: { $in: orders.map(order => order._id) }, status: 'PREPARING' }, { $inc: { __v: 1 } }, { session, timestamps: false });
    if (locked.matchedCount !== orders.length) throw new StaffApiError('CONFLICT', 409);
    const values = { kitchenPrintedAt: new Date(), lastKitchenPrintedBy: staff.id, lastRequestId: requestId };
    if (!current) {
      const [created] = await KitchenPrintState.create([{ ...scope, ...values, kitchenPrintCount: 1 }], { session });
      return metadata(created);
    }
    const updated = await KitchenPrintState.findOneAndUpdate({ ...scope, kitchenPrintCount: expectedCount }, { $inc: { kitchenPrintCount: 1 }, $set: values }, { session, returnDocument: 'after', runValidators: true }).lean();
    if (!updated) throw new StaffApiError('CONFLICT', 409);
    return metadata(updated);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });
  try { return await execute(); } catch (error) { if (isDuplicateKey(error)) return execute(); throw error; }
}
