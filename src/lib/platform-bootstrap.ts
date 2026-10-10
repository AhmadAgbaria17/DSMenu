import { User } from '@/models';
import { connectMongo } from './mongodb';
import { hashPassword } from './password';
import { createSuperAdminSchema } from './validators/staff';
// Trusted operator CLI only. Never imported by a web route.
export async function createSuperAdmin(input: unknown) {
  const data = createSuperAdminSchema.parse(input);
  await connectMongo();
  const indexes = await User.collection.indexes();
  if (!indexes.some(i => i.unique && i.key.email === 1 && Object.keys(i.key).length === 1)) throw new Error('Apply indexes first.');
  const user = await User.create({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password), role: 'SUPER_ADMIN', isActive: true });
  return { id: String(user._id), email: user.email };
}
