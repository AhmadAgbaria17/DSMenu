import 'server-only';
import mongoose from 'mongoose';
import { Order, TableSession } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { preparationInput } from '@/lib/preparation-groups';
import { publishOrderChange } from '@/lib/realtime';

export async function updatePreparationGroup(payload: unknown) {
  const staff = await requireStaffApi();
  const parsed = preparationInput.safeParse(payload);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const { orderIds, expectedStatus, status } = parsed.data;
  const result = await mongoose.connection.transaction(async transaction => {
    const anchor = await Order.findOne({ _id: orderIds[0], restaurantId: staff.restaurantId }).session(transaction).lean();
    if (!anchor || anchor.fulfillmentType === 'TAKEAWAY' || !anchor.tableId || !anchor.tableSessionId) throw new StaffApiError('NOT_FOUND', 404);
    const scope = { restaurantId: staff.restaurantId, tableId: anchor.tableId, tableSessionId: anchor.tableSessionId, fulfillmentType: { $ne: 'TAKEAWAY' as const } };
    // Serialize with order creation and session closure. A concurrent arrival is
    // either included before this boundary or remains NEW after it, never lost.
    const visit = await TableSession.findOneAndUpdate({ _id: anchor.tableSessionId, restaurantId: staff.restaurantId, tableId: anchor.tableId, status: 'ACTIVE' }, { $inc: { __v: 1 } }, { session: transaction }).select('_id').lean();
    if (!visit) throw new StaffApiError('CONFLICT', 409);
    const requested = await Order.find({ ...scope, _id: { $in: orderIds } }).session(transaction).lean();
    if (requested.length !== orderIds.length) throw new StaffApiError('NOT_FOUND', 404);
    if (requested.some(order => order.status !== expectedStatus)) throw new StaffApiError('CONFLICT', 409);
    if (expectedStatus === 'PREPARING' && (!anchor.preparationBatchId || requested.some(order => String(order.preparationBatchId) !== String(anchor.preparationBatchId)))) throw new StaffApiError('CONFLICT', 409);
    const selection = { ...scope, status: expectedStatus, ...(expectedStatus === 'PREPARING' ? { preparationBatchId: anchor.preparationBatchId } : {}) };
    const members = await Order.find(selection).select('_id').session(transaction).lean();
    if (!members.length || (expectedStatus === 'PREPARING' && members.length !== orderIds.length)) throw new StaffApiError('CONFLICT', 409);
    const preparationBatchId = expectedStatus === 'NEW' ? new mongoose.Types.ObjectId() : anchor.preparationBatchId;
    const memberIds = members.map(order => order._id);
    const changed = await Order.updateMany({ ...selection, _id: { $in: memberIds } }, { $set: { status, preparationBatchId, [status === 'PREPARING' ? 'preparingAt' : 'readyAt']: new Date() } }, { session: transaction, runValidators: true, strict: 'throw' });
    if (changed.modifiedCount !== members.length) throw new StaffApiError('CONFLICT', 409);
    // Verify persisted membership before commit, not just the modified status count.
    const persisted = await Order.countDocuments({ ...scope, _id: { $in: memberIds }, status, preparationBatchId }).session(transaction);
    if (persisted !== members.length) throw new StaffApiError('CONFLICT', 409);
    return { count: members.length, visitId: String(anchor.tableSessionId) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });
  // Only notify after the entire group commits; transport failure never undoes it.
  await publishOrderChange(staff.restaurantId, result.visitId, 'order.status.updated');
  return { count: result.count };
}
