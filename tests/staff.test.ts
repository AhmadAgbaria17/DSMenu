import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRounds } from 'bcryptjs';
import { emailSchema, loginSchema, passwordSchema, createStaffSchema, staffClaimsSchema } from '../src/lib/validators/staff';
import { hashPassword, verifyPassword, BCRYPT_COST } from '../src/lib/password';
import { allowStaffLogin } from '../src/lib/staff-login-throttle';
import { authEnv } from '../src/lib/env';

test('staff input normalizes email, preserves passwords, strips untrusted tenant claims and bounds bcrypt bytes', () => {
  assert.equal(emailSchema.parse(' Ahmed@Example.com '), 'ahmed@example.com');
  assert.deepEqual(loginSchema.parse({ email: ' STAFF@SALT.LOCAL ', password: ' spaces stay ', restaurantId: 'evil', role: 'OWNER' }), { email: 'staff@salt.local', password: ' spaces stay ' });
  for (const value of ['', 'a'.repeat(73), 'א'.repeat(37)]) assert.equal(passwordSchema.safeParse(value).success, false);
  assert.equal(passwordSchema.safeParse('א'.repeat(36)).success, true);
  assert.equal(createStaffSchema.safeParse({ email: 'a@salt.local', password: 'short', name: 'A', restaurant: 'salt', role: 'OWNER' }).success, false);
  assert.equal(staffClaimsSchema.safeParse({ sub: 'forged', restaurantId: 'x', role: 'OWNER', authVersion: 0 }).success, false);
});
test('bcrypt hashes are salted, use cost 12 and verify without truncation', async () => {
  const password = 'Local-test-passphrase';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, password); assert.notEqual(first, second);
  assert.equal(getRounds(first), BCRYPT_COST);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword('x'.repeat(73), first), false);
});
test('bounded process-local login throttle expires its window', () => {
  for (let index = 0; index < 10; index++) assert.equal(allowStaffLogin('unit@test.local', 1000), true);
  assert.equal(allowStaffLogin('unit@test.local', 1000), false);
  assert.equal(allowStaffLogin('unit@test.local', 901001), true);
});
test('staff auth requires explicit secret and a canonical site origin', () => {
  const previous = { secret: process.env.AUTH_SECRET, url: process.env.AUTH_URL, legacy: process.env.NEXTAUTH_URL };
  try {
    delete process.env.AUTH_SECRET; delete process.env.AUTH_URL; delete process.env.NEXTAUTH_URL;
    assert.throws(authEnv, /Configure AUTH_SECRET/);
    process.env.AUTH_SECRET = 'unit-test-secret-with-more-than-32-characters';
    process.env.AUTH_URL = 'https://dsmenu.com';
    assert.equal(authEnv().origin, 'https://dsmenu.com');
    process.env.AUTH_URL = 'https://dsmenu.com/unsafe-path';
    assert.throws(authEnv);
  } finally {
    for (const [key, value] of Object.entries({ AUTH_SECRET: previous.secret, AUTH_URL: previous.url, NEXTAUTH_URL: previous.legacy })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
