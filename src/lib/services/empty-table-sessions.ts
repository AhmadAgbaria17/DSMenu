import 'server-only';
import mongoose, { Types } from 'mongoose';
import { Order, ServiceCall, TableSession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { EMPTY_TABLE_SESSION_BATCH_SIZE, emptySessionFilter } from '@/lib/empty-table-sessions';

class SessionHasActivity extends Error {}
type Scope = { restaurantId: Types.ObjectId | string; tableId?: Types.ObjectId | string };
type Candidate = { _id: Types.ObjectId; restaurantId: Types.ObjectId; tableId: Types.ObjectId };

// No browser-supplied scope is accepted by the cron route. Lazy callers derive
// restaurant/table identity from staff auth or the validated public slug/table.
export async function closeEmptyTableSessions(scope?: Scope) {
  await connectMongo();
  const now = new Date();
  const eligibility = emptySessionFilter(now);
  const tenant = scope ? { restaurantId: new Types.ObjectId(scope.restaurantId), ...(scope.tableId ? { tableId: new Types.ObjectId(scope.tableId) } : {}) } : {};
  const candidates = await TableSession.aggregate<Candidate>([
    { $match: { ...eligibility, ...tenant } },
    { $sort: { createdAt: 1, _id: 1 } },
    // Indexed existence probes before limiting avoid repeatedly choosing old
    // occupied sessions and starving eligible empty sessions further in the list.
    { $lookup: { from: Order.collection.name, let: { visit: '$_id', restaurant: '$restaurantId' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$tableSessionId', '$$visit'] }, { $eq: ['$restaurantId', '$$restaurant'] }] } } },
      { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'orders' } },
    { $match: { 'orders.0': { $exists: false } } },
    { $lookup: { from: ServiceCall.collection.name, let: { visit: '$_id', restaurant: '$restaurantId' }, pipeline: [
      { $match: { status: { $in: ['PENDING', 'ACKNOWLEDGED'] }, $expr: { $and: [{ $eq: ['$tableSessionId', '$$visit'] }, { $eq: ['$restaurantId', '$$restaurant'] }] } } },
      { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'calls' } },
    { $match: { 'calls.0': { $exists: false } } },
    { $limit: EMPTY_TABLE_SESSION_BATCH_SIZE },
    { $project: { _id: 1, restaurantId: 1, tableId: 1 } },
  ]).option({ maxTimeMS: 10_000 });
  let closed = 0;
  for (const candidate of candidates) {
    try {
      const changed = await mongoose.connection.transaction(async session => {
        // This write serializes against both order and service creation. If a
        // competing transaction wins, the retry rechecks dates and all blockers.
        const visit = await TableSession.findOneAndUpdate({ ...eligibility, ...candidate }, {
          $set: { status: 'CLOSED', closedAt: now, closeReason: 'AUTO_EMPTY_TIMEOUT' },
          $unset: { accessCode: '', codeAttemptCount: '', codeAttemptWindowAt: '' },
        }, { session, returnDocument: 'after', runValidators: true }).select('_id').lean();
        if (!visit) return false;
        const childScope = { restaurantId: candidate.restaurantId, tableSessionId: candidate._id };
        if (await Order.exists(childScope).session(session)) throw new SessionHasActivity();
        if (await ServiceCall.exists({ ...childScope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }).session(session)) throw new SessionHasActivity();
        return true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10_000 });
      if (changed) closed++;
    } catch (error) {
      // Throwing aborts the tentative close, including its timestamp/reason.
      if (!(error instanceof SessionHasActivity)) throw error;
    }
  }
  return { examined: candidates.length, closed, batchLimit: EMPTY_TABLE_SESSION_BATCH_SIZE };
}
