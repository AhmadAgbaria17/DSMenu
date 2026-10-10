import 'server-only';
import { randomBytes } from 'node:crypto';
import { Restaurant, User } from '@/models';
import { connectMongo } from '@/lib/mongodb';
import { hashPassword, verifyPassword } from '@/lib/password';
import { loginSchema, authClaimsSchema } from '@/lib/validators/staff';
import { allowStaffLogin } from '@/lib/staff-login-throttle';

let dummyHash: Promise<string> | undefined;
export async function authenticateStaff(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success || !allowStaffLogin(parsed.data.email)) return null;
  await connectMongo();
  const user = await User.findOne({ email: parsed.data.email }).select('_id restaurantId name email role isActive +passwordHash +authVersion').lean();
  // Unknown accounts still perform bcrypt work; no account-existence error is exposed.
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  const matches = await verifyPassword(parsed.data.password, user?.passwordHash ?? await dummyHash);
  if (!user || !matches || !user.isActive) return null;
  if (user.role === 'SUPER_ADMIN' ? !!user.restaurantId : !user.restaurantId || !await Restaurant.exists({ _id: user.restaurantId, isActive: true })) return null;
  return { id: String(user._id), restaurantId: user.restaurantId ? String(user.restaurantId) : undefined, name: user.name, email: user.email, role: user.role, authVersion: user.authVersion ?? 0 };
}

export async function validateStaffClaims(input: unknown) {
  const parsed = authClaimsSchema.safeParse(input);
  if (!parsed.success) return null;
  await connectMongo();
  const claims = parsed.data;
  const user = await User.findOne({ _id: claims.sub, restaurantId: claims.restaurantId ?? { $exists: false }, role: claims.role, isActive: true }).select('_id restaurantId name email role +authVersion').lean();
  if (!user || (user.authVersion ?? 0) !== claims.authVersion) return null;
  if (user.role === 'SUPER_ADMIN' ? !!user.restaurantId : !user.restaurantId || !await Restaurant.exists({ _id: user.restaurantId, isActive: true })) return null;
  return { id: String(user._id), restaurantId: user.restaurantId ? String(user.restaurantId) : undefined, name: user.name, email: user.email, role: user.role, authVersion: user.authVersion ?? 0 };
}

export async function revokeStaffSessions(input: unknown) {
  const parsed = authClaimsSchema.safeParse(input);
  if (!parsed.success) return;
  await connectMongo();
  const { sub, restaurantId, authVersion, role } = parsed.data;
  await User.updateOne({ _id: sub, restaurantId: restaurantId ?? { $exists: false }, role, $or: [{ authVersion }, ...(authVersion === 0 ? [{ authVersion: { $exists: false } }] : [])] }, { $inc: { authVersion: 1 } });
}
