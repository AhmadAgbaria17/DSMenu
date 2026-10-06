import { Restaurant, User } from '@/models';
import { connectMongo } from './mongodb';
import { hashPassword } from './password';
import { createStaffSchema } from './validators/staff';

// Administrative CLI only. There is intentionally no public registration endpoint.
export async function createStaffUser(input: unknown) {
  const data = createStaffSchema.parse(input);
  await connectMongo();
  const restaurant = await Restaurant.findOne({ slug: data.restaurant, isActive: true }).select('_id').lean();
  if (!restaurant) throw new Error('Restaurant unavailable.');
  const passwordHash = await hashPassword(data.password);
  // Insert, never upsert: reruns cannot reset an existing employee's credentials.
  const user = await User.create({ restaurantId: restaurant._id, name: data.name, email: data.email, passwordHash, role: data.role });
  return { id: String(user._id), restaurantId: String(restaurant._id), email: user.email, role: user.role };
}
