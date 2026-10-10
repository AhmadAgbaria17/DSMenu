import { z } from 'zod';
import { createRestaurantSchema } from './restaurant-admin';
import { createStaffSchema } from './staff';
export const onboardRestaurantSchema = createRestaurantSchema.extend({
  ownerName: createStaffSchema.shape.name, ownerEmail: createStaffSchema.shape.email,
  password: createStaffSchema.shape.password,
}).strict();
export const restaurantActivationSchema = z.object({ isActive: z.boolean() }).strict();
