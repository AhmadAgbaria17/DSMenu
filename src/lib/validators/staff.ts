import { z } from 'zod';
import { objectIdSchema, slugSchema } from './common';

export const staffRoles = ['OWNER', 'STAFF'] as const;
export type StaffRole = (typeof staffRoles)[number];
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
// bcrypt truncates after 72 UTF-8 bytes; reject instead of silently truncating.
export const passwordSchema = z.string().min(1).max(72).refine(value => new TextEncoder().encode(value).length <= 72);
export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export const createStaffSchema = loginSchema.extend({
  password: passwordSchema.refine(value => value.length >= 12),
  restaurant: slugSchema, name: z.string().trim().min(1).max(160), role: z.enum(staffRoles),
});
export const staffClaimsSchema = z.object({
  sub: objectIdSchema, restaurantId: objectIdSchema, role: z.enum(staffRoles),
  authVersion: z.number().int().nonnegative(),
});

export const authClaimsSchema = z.union([staffClaimsSchema, z.object({
  sub: objectIdSchema, role: z.literal('SUPER_ADMIN'), restaurantId: z.undefined().optional(),
  authVersion: z.number().int().nonnegative(),
})]);
export type AuthRole = StaffRole | 'SUPER_ADMIN';
export const createSuperAdminSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(160), password: createStaffSchema.shape.password,
}).strict();
