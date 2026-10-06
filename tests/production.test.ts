import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createRestaurantSchema } from '../src/lib/validators/restaurant-admin';
import { productionConfigurationIssues } from '../src/lib/production-config';
test('restaurant onboarding validates supported defaults and rejects ownership/credential overrides', () => {
  assert.deepEqual(createRestaurantSchema.parse({ name: ' Real Restaurant ', slug: 'real-restaurant' }), { name: 'Real Restaurant', slug: 'real-restaurant', defaultLanguage: 'ar', enabledLanguages: ['ar', 'he', 'en'], currency: 'ILS' });
  for (const input of [{ name: '', slug: 'test' }, { name: 'Test', slug: '../bad' }, { name: 'Test', slug: 'test', password: 'default' }, { name: 'Test', slug: 'test', enabledLanguages: ['ar', 'ar', 'en'] }, { name: 'Test', slug: 'test', currency: 'USD' }, { name: 'Test', slug: 'test', defaultLanguage: 'he' }]) assert.equal(createRestaurantSchema.safeParse(input).success, false);
});
test('production preflight rejects insecure/mismatched origins, missing providers and public secrets without echoing values', () => {
  const original = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) if (key.startsWith('NEXT_PUBLIC_')) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1/test', APP_URL: 'https://dsmenu.com', AUTH_URL: 'https://dsmenu.com', AUTH_SECRET: randomBytes(32).toString('hex'), REALTIME_APP_ID: '123', REALTIME_KEY: 'test-key', REALTIME_SECRET: randomBytes(16).toString('hex'), REALTIME_CLUSTER: 'eu', CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: randomBytes(16).toString('hex') });
    delete process.env.NEXTAUTH_URL;
    assert.deepEqual(productionConfigurationIssues(), []);
    process.env.APP_URL = 'http://localhost:3000'; assert.ok(productionConfigurationIssues().some(issue => issue.includes('HTTPS')));
    process.env.APP_URL = 'https://dsmenu.com'; process.env.AUTH_URL = 'https://other.example'; assert.ok(productionConfigurationIssues().some(issue => issue.includes('match')));
    process.env.AUTH_URL = 'https://dsmenu.com'; process.env.NEXT_PUBLIC_AUTH_SECRET = process.env.AUTH_SECRET; delete process.env.CLOUDINARY_API_SECRET; delete process.env.REALTIME_SECRET;
    const issues = productionConfigurationIssues(); assert.ok(issues.some(issue => issue.includes('NEXT_PUBLIC'))); assert.ok(issues.some(issue => issue.includes('CLOUDINARY'))); assert.ok(issues.some(issue => issue.includes('REALTIME')));
    assert.equal(JSON.stringify(issues).includes(process.env.AUTH_SECRET!), false);
  } finally { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); }
});
