import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { User } from '../src/models';
import { authClaimsSchema, createStaffSchema, createSuperAdminSchema } from '../src/lib/validators/staff';
import { onboardRestaurantSchema } from '../src/lib/validators/platform';
const password = '  secure-password-123  ';
test('platform roles require no tenant while restaurant roles require a tenant; staff cannot create platform accounts', async () => {
  const sub = String(new Types.ObjectId());
  assert.ok(authClaimsSchema.safeParse({ sub, role: 'SUPER_ADMIN', authVersion: 0 }).success);
  assert.equal(authClaimsSchema.safeParse({ sub, role: 'SUPER_ADMIN', restaurantId: sub, authVersion: 0 }).success, false);
  assert.equal(authClaimsSchema.safeParse({ sub, role: 'OWNER', authVersion: 0 }).success, false);
  assert.equal(createStaffSchema.safeParse({ restaurant: 'salt', name: 'Owner', email: 'owner@example.com', password, role: 'SUPER_ADMIN' }).success, false);
  const base = { name: 'Admin', email: 'admin@example.com', passwordHash: '$2b$12$' + 'a'.repeat(53) };
  await new User({ ...base, role: 'SUPER_ADMIN' }).validate();
  await assert.rejects(new User({ ...base, role: 'SUPER_ADMIN', restaurantId: sub }).validate());
  await assert.rejects(new User({ ...base, role: 'OWNER' }).validate());
  await assert.rejects(new User({ ...base, role: 'STAFF' }).validate());
});
test('onboarding normalizes email, preserves password whitespace, rejects privilege injection and invalid password/slug', () => {
  const input = { name: 'Salt Test', slug: 'salt-test', ownerName: 'Owner', ownerEmail: ' Owner@Salt.local ', password };
  const data = onboardRestaurantSchema.parse(input);
  assert.equal(data.ownerEmail, 'owner@salt.local'); assert.equal(data.password, password);
  assert.equal(data.defaultLanguage, 'ar'); assert.deepEqual(data.enabledLanguages, ['ar', 'he', 'en']);
  for (const patch of [{ role: 'SUPER_ADMIN' }, { restaurantId: String(new Types.ObjectId()) }, { password: 'short' }, { password: 'x'.repeat(73) }, { password: '\u05d0'.repeat(37) }, { slug: 'Salt Test' }, { slug: '../bad' }]) assert.equal(onboardRestaurantSchema.safeParse({ ...input, ...patch }).success, false);
  assert.equal(createSuperAdminSchema.parse({ name: 'Admin', email: ' ADMIN@EXAMPLE.COM ', password }).email, 'admin@example.com');
});
