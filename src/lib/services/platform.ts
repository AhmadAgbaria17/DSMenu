import 'server-only';
import mongoose from 'mongoose';
import { Restaurant, User } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { hashPassword } from '@/lib/password';
import { requireSuperAdmin, PlatformError } from '@/lib/platform-context';
import { onboardRestaurantSchema, restaurantActivationSchema } from '@/lib/validators/platform';
import { objectIdSchema } from '@/lib/validators/common';

export async function platformOverview() {
  await requireSuperAdmin(); await connectMongo();
  const [total, active, users] = await Promise.all([Restaurant.countDocuments(), Restaurant.countDocuments({ isActive: true }), User.countDocuments({ role: { $in: ['OWNER', 'STAFF'] } })]);
  return { total, active, inactive: total - active, users };
}
export async function listPlatformRestaurants(page = 1) {
  await requireSuperAdmin(); await connectMongo();
  const safePage = Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
  const rows = await Restaurant.find().select('_id name slug isActive createdAt').sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * 50).limit(51).lean();
  const visible = rows.slice(0, 50);
  const owners = await User.find({ restaurantId: { $in: visible.map(r => r._id) }, role: 'OWNER' }).select('restaurantId email').sort({ createdAt: 1 }).lean();
  return { page: safePage, hasNext: rows.length > 50, restaurants: visible.map(r => ({ id: String(r._id), name: r.name, slug: r.slug, isActive: r.isActive, createdAt: r.createdAt.toISOString(), ownerEmail: owners.find(u => String(u.restaurantId) === String(r._id))?.email ?? null })) };
}
export async function onboardRestaurant(input: unknown) {
  await requireSuperAdmin();
  const parsed = onboardRestaurantSchema.safeParse(input);
  if (!parsed.success) throw new PlatformError('INVALID_REQUEST', 400);
  const { ownerName, ownerEmail, password, ...restaurantData } = parsed.data;
  await connectMongo();
  // Production autoIndex is off. Do not onboard without the authoritative uniqueness constraints.
  for (const [model, field] of [[Restaurant, 'slug'], [User, 'email']] as const) {
    const indexes = await model.collection.indexes();
    if (!indexes.some(i => i.unique && i.key[field] === 1 && Object.keys(i.key).length === 1)) throw new Error('Required onboarding index missing');
  }
  const passwordHash = await hashPassword(password);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const [restaurant] = await Restaurant.create([{ ...restaurantData, isActive: true }], { session });
      await User.create([{ restaurantId: restaurant._id, name: ownerName, email: ownerEmail, passwordHash, role: 'OWNER', isActive: true }], { session });
      return { id: String(restaurant._id), slug: restaurant.slug };
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      throw new PlatformError(error.keyPattern?.email ? 'EMAIL_EXISTS' : 'SLUG_EXISTS', 409);
    }
    throw error;
  } finally { await session.endSession(); }
}
export async function setRestaurantActive(id: string, input: unknown) {
  await requireSuperAdmin();
  const parsed = restaurantActivationSchema.safeParse(input);
  if (!objectIdSchema.safeParse(id).success || !parsed.success) throw new PlatformError('INVALID_REQUEST', 400);
  await connectMongo();
  const result = await Restaurant.updateOne({ _id: id }, { $set: { isActive: parsed.data.isActive } }, { runValidators: true });
  if (!result.matchedCount) throw new PlatformError('NOT_FOUND', 404);
  return { id, isActive: parsed.data.isActive };
}
