import 'server-only';
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

export async function establishCustomerVisit(target: CustomerTable, existingToken?: string) {
  await closeEmptyTableSessions({ restaurantId: target.restaurant._id, tableId: target.table._id });
  if (existingToken && tokenHash(existingToken)) {
    try {
      const visit = await requireCustomerVisit(target, existingToken);
      // A refresh with a valid credential does not write activity or rotate cookies.
      return { visitId: String(visit._id), newToken: null, expiresAt: null };
    } catch (error) {
      if (!(error instanceof CustomerRequestError)) throw error;
    }
  }
  const token = newCustomerToken();
  const expiresAt = new Date(Date.now() + CREDENTIAL_LIFETIME_SECONDS * 1000);
  const credential = { tokenHash: tokenHash(token)!, expiresAt };
  const scope = { restaurantId: target.restaurant._id, tableId: target.table._id, status: 'ACTIVE' as const };
  const execute = () => mongoose.connection.transaction(async transaction => {
    const available = await Table.updateOne({ _id: target.table._id, restaurantId: target.restaurant._id, isActive: true }, { $inc: { lifecycleVersion: 1 } }, { session: transaction });
    if (!available.matchedCount) throw new CustomerRequestError('TABLE_UNAVAILABLE', 404);
    const visit = await TableSession.findOne(scope).select('_id').session(transaction).lean();
    if (!visit) {
      const [created] = await TableSession.create([{ ...scope, credentials: [credential], lastActivityAt: new Date() }], { session: transaction });
      return { visitId: String(created._id), newToken: token, expiresAt };
    }
    await TableSession.updateOne({ ...scope, _id: visit._id }, { $pull: { credentials: { expiresAt: { $lte: new Date() } } } }, { session: transaction });
    const attached = await TableSession.findOneAndUpdate({
      ...scope, _id: visit._id, [`credentials.${MAX_VISIT_CREDENTIALS - 1}`]: { $exists: false },
    }, { $push: { credentials: credential } }, { session: transaction, returnDocument: 'after', runValidators: true }).select('_id').lean();
    if (!attached) throw new CustomerRequestError('SESSION_LIMIT', 429);
    return { visitId: String(attached._id), newToken: token, expiresAt };
  });
  try { return await execute(); }
  catch (error) { if (isDuplicateKey(error)) return execute(); throw error; }
}
