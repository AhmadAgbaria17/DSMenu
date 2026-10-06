import 'server-only';
import { ServiceCall, Table } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { canChangeService, serviceStatusInput } from '@/lib/service-flow';
import { objectIdSchema } from '@/lib/validators/common';
import { serviceDto } from '@/lib/service-dto';
import { realtimeConfig, publishServiceChange } from '@/lib/realtime';
import { restaurantChannel } from '@/lib/realtime-channels';
import type { ServiceSnapshot } from '@/types/service-calls';
export async function getRestaurantServices(): Promise<ServiceSnapshot> {
  const staff = await requireStaffApi();
  const scope = { restaurantId: staff.restaurantId };
  const [active, history] = await Promise.all([
    ServiceCall.find({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }).sort({ createdAt: 1, _id: 1 }).lean(),
    ServiceCall.find({ ...scope, status: 'RESOLVED' }).sort({ resolvedAt: -1, _id: -1 }).limit(100).lean(),
  ]);
  const all = [...active, ...history];
  const tables = await Table.find({ ...scope, _id: { $in: all.map(call => call.tableId) } }).select('_id tableNumber').lean();
  const numbers = new Map(tables.map(table => [String(table._id), table.tableNumber]));
  return { fetchedAt: new Date().toISOString(), realtime: realtimeConfig(restaurantChannel(staff.restaurantId)), calls: all.map(call => ({ ...serviceDto(call), tableNumber: numbers.get(String(call.tableId)) ?? null, tableSessionId: String(call.tableSessionId) })) };
}
export async function updateServiceStatus(id: string, payload: unknown) {
  const staff = await requireStaffApi();
  const parsed = serviceStatusInput.safeParse(payload);
  if (!objectIdSchema.safeParse(id).success || !parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const { expectedStatus, status } = parsed.data;
  if (!canChangeService(expectedStatus, status)) throw new StaffApiError('INVALID_TRANSITION', 422);
  const scope = { _id: id, restaurantId: staff.restaurantId };
  const stamp = status === 'ACKNOWLEDGED' ? { acknowledgedAt: new Date() } : { resolvedAt: new Date() };
  const call = await ServiceCall.findOneAndUpdate({ ...scope, status: expectedStatus }, { $set: { status, ...stamp } }, { returnDocument: 'after', runValidators: true }).lean();
  if (!call) { if (!await ServiceCall.exists(scope)) throw new StaffApiError('NOT_FOUND', 404); throw new StaffApiError('CONFLICT', 409); }
  await publishServiceChange(staff.restaurantId, String(call.tableSessionId), 'serviceCall.updated');
  return serviceDto(call);
}
