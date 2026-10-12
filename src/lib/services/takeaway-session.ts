import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { Restaurant, TakeawaySession } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { slugSchema } from '@/lib/validators/common';
import { takeawayIdentity } from '@/lib/validators/takeaway';
import { CustomerRequestError } from '@/lib/customer-errors';
import { CREDENTIAL_LIFETIME_SECONDS, newCustomerToken, tokenHash } from '@/lib/customer-security';
import { requireTakeawayIndexes } from '@/lib/order-indexes';
export async function resolveTakeaway(slug: string, transaction: ClientSession | null = null) {
  if (!slugSchema.safeParse(slug).success) throw new CustomerRequestError('INVALID_REQUEST');
  await connectMongo();
  const restaurant = await Restaurant.findOne({ slug, isActive: true }).select('_id slug currency').session(transaction).lean();
  if (!restaurant) throw new CustomerRequestError('TABLE_UNAVAILABLE', 404);
  return restaurant;
}
export function takeawayCredential(restaurantId: Types.ObjectId, token?: string) {
  const hash = token ? tokenHash(token) : null;
  if (!hash) throw new CustomerRequestError('SESSION_REQUIRED', 401);
  return { restaurantId, tokenHash: hash, expiresAt: { $gt: new Date() } };
}
export async function requireTakeawayVisit(restaurantId: Types.ObjectId, token?: string, transaction: ClientSession | null = null) {
  const visit = await TakeawaySession.findOne(takeawayCredential(restaurantId, token)).session(transaction).lean();
  if (!visit) throw new CustomerRequestError('SESSION_REQUIRED', 401);
  if (visit.status !== 'ACTIVE') throw new CustomerRequestError('SESSION_CLOSED', 409);
  return visit;
}
export async function establishTakeaway(slug: string, token: string | undefined, input: unknown) {
  const parsed = takeawayIdentity.safeParse(input);
  if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
  const restaurant = await resolveTakeaway(slug);
  await requireTakeawayIndexes();
  if (token && tokenHash(token)) {
    try { const visit = await requireTakeawayVisit(restaurant._id, token); return { visitId: String(visit._id), newToken: null, expiresAt: null }; }
    catch (error) { if (!(error instanceof CustomerRequestError)) throw error; }
  }
  const newToken = newCustomerToken(); const expiresAt = new Date(Date.now() + CREDENTIAL_LIFETIME_SECONDS * 1000);
  const visit = await TakeawaySession.create({ restaurantId: restaurant._id, ...parsed.data, tokenHash: tokenHash(newToken)!, expiresAt });
  return { visitId: String(visit._id), newToken, expiresAt };
}
