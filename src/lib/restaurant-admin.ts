import { Restaurant } from '@/models';
import { connectMongo } from './mongodb';
import { createRestaurantSchema } from './validators/restaurant-admin';

// Operator CLI only: no public registration or web super-admin endpoint.
export async function createRestaurant(input: unknown) {
  const data = createRestaurantSchema.parse(input);
  await connectMongo();
  const indexes = await Restaurant.collection.indexes();
  if (!indexes.some(index => index.unique && index.key.slug === 1 && Object.keys(index.key).length === 1)) throw new Error('Apply database indexes before onboarding.');
  // Insert only. The unique slug index rejects reruns/concurrent duplicates.
  const restaurant = await Restaurant.create(data);
  return { id: String(restaurant._id), slug: restaurant.slug };
}
