import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { tableAccessInput, TABLE_CODE_ATTEMPTS, TABLE_CODE_WINDOW_MS, type TableAccessState } from '@/lib/table-access';
import { closeEmptyTableSessions } from './empty-table-sessions';
import mongoose, { type ClientSession } from 'mongoose';
import { Restaurant, Table, TableSession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { slugSchema, tableQuerySchema } from '@/lib/validators/common';
import { CustomerRequestError, isDuplicateKey } from '@/lib/customer-errors';
import { CREDENTIAL_LIFETIME_SECONDS, MAX_VISIT_CREDENTIALS, newCustomerToken, tokenHash } from '@/lib/customer-security';

export async function resolveCustomerTable(slug: string, tableValue: string, transaction: ClientSession | null = null) {
  const parsedSlug = slugSchema.safeParse(slug);
  const parsedTable = tableQuerySchema.safeParse(tableValue);
  if (!parsedSlug.success || !parsedTable.success) throw new CustomerRequestError('INVALID_REQUEST');
  await connectMongo();
  const restaurant = await Restaurant.findOne({ slug: parsedSlug.data, isActive: true }).select('_id slug currency').session(transaction).lean();
  if (!restaurant) throw new CustomerRequestError('TABLE_UNAVAILABLE', 404);
  const table = await Table.findOne({ restaurantId: restaurant._id, tableNumber: parsedTable.data, isActive: true }).select('_id tableNumber').session(transaction).lean();
  if (!table) throw new CustomerRequestError('TABLE_UNAVAILABLE', 404);
  return { restaurant, table };
}
export type CustomerTable = Awaited<ReturnType<typeof resolveCustomerTable>>;

export function credentialFilter(target: CustomerTable, token: string | undefined) {
  const hash = token ? tokenHash(token) : null;
  if (!hash) throw new CustomerRequestError('SESSION_REQUIRED', 401);
  return {
    restaurantId: target.restaurant._id,
    tableId: target.table._id,
    credentials: { $elemMatch: { tokenHash: hash, expiresAt: { $gt: new Date() } } },
  };
}

export async function requireCustomerVisit(target: CustomerTable, token: string | undefined, transaction: ClientSession | null = null) {
  const visit = await TableSession.findOne(credentialFilter(target, token)).select('_id status nextOrderNumber').session(transaction).lean();
  if (!visit) throw new CustomerRequestError('SESSION_REQUIRED', 401);
  if (visit.status !== 'ACTIVE') throw new CustomerRequestError('SESSION_CLOSED', 409);
  return visit;
}

export async function getTableAccess(target: CustomerTable, token?: string): Promise<TableAccessState> {
  await closeEmptyTableSessions({ restaurantId: target.restaurant._id, tableId: target.table._id });
  const scope = { restaurantId: target.restaurant._id, tableId: target.table._id, status: 'ACTIVE' as const };
  const visit = await TableSession.findOne(scope).select('_id +accessCode').lean();
  if (!visit) return { mode: 'CREATE' };
  const verified = token && tokenHash(token) && await TableSession.exists({ ...scope, _id: visit._id, ...credentialFilter(target, token) });
  if (verified) return visit.accessCode ? { mode: 'AUTHORIZED', visitId: String(visit._id) } : { mode: 'SETUP', sessionId: String(visit._id) };
  return visit.accessCode ? { mode: 'JOIN', sessionId: String(visit._id) } : { mode: 'WAIT' };
}

export async function establishCustomerVisit(target: CustomerTable, existingToken: string | undefined, payload: unknown) {
  await closeEmptyTableSessions({ restaurantId: target.restaurant._id, tableId: target.table._id });
  // Empty POST is retained only as a no-write resume for already authorized
  // devices. It must never attach a new credential or create a visit.
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0) {
    try {
      const visit = await requireCustomerVisit(target, existingToken);
      return { visitId: String(visit._id), newToken: null, expiresAt: null };
    } catch (error) {
      if (!(error instanceof CustomerRequestError)) throw error;
      throw new CustomerRequestError('TABLE_CODE_REQUIRED', 403);
    }
  }
  const parsed = tableAccessInput.safeParse(payload);
  if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
  const input = parsed.data;
  const token = newCustomerToken();
  const expiresAt = new Date(Date.now() + CREDENTIAL_LIFETIME_SECONDS * 1000);
  const credential = { tokenHash: tokenHash(token)!, expiresAt };
  const scope = { restaurantId: target.restaurant._id, tableId: target.table._id, status: 'ACTIVE' as const };
  const execute = () => mongoose.connection.transaction(async transaction => {
    const available = await Table.updateOne({ _id: target.table._id, restaurantId: target.restaurant._id, isActive: true }, { $inc: { lifecycleVersion: 1 } }, { session: transaction });
    if (!available.matchedCount) throw new CustomerRequestError('TABLE_UNAVAILABLE', 404);
    const visit = await TableSession.findOne(scope).select('_id +accessCode +codeAttemptCount +codeAttemptWindowAt').session(transaction).lean();
    if (input.action === 'CREATE') {
      if (visit) throw new CustomerRequestError('TABLE_SESSION_STARTED', 409);
      const [created] = await TableSession.create([{ ...scope, accessCode: input.code, credentials: [credential], lastActivityAt: new Date() }], { session: transaction });
      return { visitId: String(created._id), newToken: token, expiresAt };
    }
    if (!visit || String(visit._id) !== input.sessionId) throw new CustomerRequestError('TABLE_SESSION_CHANGED', 409);
    if (input.action === 'SETUP') {
      const authorized = await requireCustomerVisit(target, existingToken, transaction);
      if (String(authorized._id) !== input.sessionId) throw new CustomerRequestError('TABLE_SESSION_CHANGED', 409);
      if (visit.accessCode) throw new CustomerRequestError('TABLE_SESSION_STARTED', 409);
      await TableSession.updateOne({ ...scope, _id: visit._id, accessCode: { $exists: false } }, { $set: { accessCode: input.code } }, { session: transaction, runValidators: true });
      return { visitId: String(visit._id), newToken: null, expiresAt: null };
    }
    if (!visit.accessCode) throw new CustomerRequestError('TABLE_CODE_REQUIRED', 403);
    const now = new Date();
    const inWindow = !!visit.codeAttemptWindowAt && now.getTime() - visit.codeAttemptWindowAt.getTime() < TABLE_CODE_WINDOW_MS;
    const attempts = inWindow ? visit.codeAttemptCount ?? 0 : 0;
    if (attempts >= TABLE_CODE_ATTEMPTS) throw new CustomerRequestError('TABLE_CODE_LIMIT', 429);
    if (!timingSafeEqual(Buffer.from(visit.accessCode), Buffer.from(input.code))) {
      await TableSession.updateOne({ ...scope, _id: visit._id }, { $set: { codeAttemptCount: attempts + 1, codeAttemptWindowAt: inWindow ? visit.codeAttemptWindowAt : now } }, { session: transaction, timestamps: false });
      // Return, then throw AFTER commit, so failed attempts persist across
      // workers/restarts and are not undone by transaction rollback.
      return { denied: true as const };
    }
    // Repeated successful submissions from an already joined browser do not
    // rotate cookies or exhaust the credential cap.
    if (existingToken && tokenHash(existingToken) && await TableSession.exists({ ...scope, _id: visit._id, ...credentialFilter(target, existingToken) }).session(transaction)) {
      return { visitId: String(visit._id), newToken: null, expiresAt: null };
    }
    await TableSession.updateOne({ ...scope, _id: visit._id }, { $pull: { credentials: { expiresAt: { $lte: now } } } }, { session: transaction });
    const attached = await TableSession.findOneAndUpdate({ ...scope, _id: visit._id, [`credentials.${MAX_VISIT_CREDENTIALS - 1}`]: { $exists: false } }, { $push: { credentials: credential } }, { session: transaction, returnDocument: 'after', runValidators: true }).select('_id').lean();
    if (!attached) throw new CustomerRequestError('SESSION_LIMIT', 429);
    return { visitId: String(attached._id), newToken: token, expiresAt };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });
  let result;
  try { result = await execute(); }
  catch (error) { if (isDuplicateKey(error)) result = await execute(); else throw error; }
  if ('denied' in result) throw new CustomerRequestError('TABLE_CODE_INCORRECT', 403);
  return result;
}
