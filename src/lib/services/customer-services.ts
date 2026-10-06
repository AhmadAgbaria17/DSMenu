import 'server-only';
import mongoose from 'mongoose';
import { ServiceCall, TableSession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { CustomerRequestError, isDuplicateKey } from '@/lib/customer-errors';
import { serviceDto } from '@/lib/service-dto';
import { serviceInput, SERVICE_COOLDOWN_MS } from '@/lib/service-flow';
import { publishServiceChange } from '@/lib/realtime';
import { serviceTypes } from '@/types/domain';
import { credentialFilter, requireCustomerVisit, resolveCustomerTable } from './customer-session';

export class ServiceCooldownError extends Error {
  constructor(public retryAt: string) { super('COOLDOWN'); }
}
export async function getCustomerServices(slug: string, table: string, token?: string) {
  const target = await resolveCustomerTable(slug, table);
  const visit = await requireCustomerVisit(target, token);
  const calls = await Promise.all(serviceTypes.map(type => ServiceCall.findOne({ restaurantId: target.restaurant._id, tableId: target.table._id, tableSessionId: visit._id, type }).sort({ createdAt: -1, _id: -1 }).lean()));
  return { calls: calls.flatMap(call => call ? [serviceDto(call)] : []) };
}
export async function submitCustomerService(slug: string, table: string, token: string | undefined, payload: unknown) {
  const parsed = serviceInput.safeParse(payload);
  if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
  await connectMongo();
  const execute = () => mongoose.connection.transaction(async transaction => {
    const target = await resolveCustomerTable(slug, table, transaction);
    const visit = await requireCustomerVisit(target, token, transaction);
    const scope = { restaurantId: target.restaurant._id, tableId: target.table._id, tableSessionId: visit._id, type: parsed.data.type };
    const existing = await ServiceCall.findOne({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }).session(transaction).lean();
    if (existing) return { call: serviceDto(existing), created: false, restaurantId: String(target.restaurant._id), visitId: String(visit._id) };
    const latest = await ServiceCall.findOne(scope).sort({ createdAt: -1, _id: -1 }).session(transaction).lean();
    const now = new Date();
    if (latest && latest.createdAt.getTime() + SERVICE_COOLDOWN_MS > now.getTime()) throw new ServiceCooldownError(new Date(latest.createdAt.getTime() + SERVICE_COOLDOWN_MS).toISOString());
    // Serialize competing requests and visit closure, including quick resolve/recreate races.
    const locked = await TableSession.updateOne({ ...credentialFilter(target, token), _id: visit._id, status: 'ACTIVE' }, { $inc: { serviceCallSequence: 1 }, $set: { lastActivityAt: now } }, { session: transaction });
    if (!locked.matchedCount) throw new CustomerRequestError('SESSION_CLOSED', 409);
    const [call] = await ServiceCall.create([{ ...scope, status: 'PENDING' }], { session: transaction });
    return { call: serviceDto(call), created: true, restaurantId: String(target.restaurant._id), visitId: String(visit._id) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });
  let result;
  try { result = await execute(); } catch (error) { if (isDuplicateKey(error)) result = await execute(); else throw error; }
  if (result.created) await publishServiceChange(result.restaurantId, result.visitId, 'serviceCall.created');
  return { call: result.call, alreadyPending: !result.created };
}
