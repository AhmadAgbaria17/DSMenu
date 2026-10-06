import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createStaffUser } from '../src/lib/staff-users';
import { User, Restaurant, Table, TableSession, Order, ServiceCall } from '../src/models';

export type StaffFixture = { email: string; password: string; restaurantId: string; userId: string };
type SessionResponse = { user?: { id: string; restaurantId: string; role: string; name: string; email: string }; expires?: string } | null;

async function assertLoginRedirect(response: Response) {
  // App Router loading boundaries can stream a 200 with a redirect instruction.
  // In either case, no protected content may be present in the response.
  if (response.status === 307) {
    assert.equal(new URL(response.headers.get('location')!, 'http://localhost').pathname, '/login');
    return;
  }
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<meta[^>]*http-equiv="refresh"[^>]*content="\d+;url=\/login"/);
  assert.doesNotMatch(html, /data-testid="(?:dashboard-restaurant|metric-)/);
}

export class AuthClient {
  cookies = new Map<string, string>();
  constructor(private base: string) {}
  cookie() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.base}${path}`, { ...init, redirect: 'manual', headers: { cookie: this.cookie(), ...init.headers } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const split = pair.indexOf('=');
      const key = pair.slice(0, split); const value = pair.slice(split + 1);
      if (!value) this.cookies.delete(key); else this.cookies.set(key, value);
    }
    return response;
  }
  async csrf() { return (await (await this.request('/api/auth/csrf')).json() as { csrfToken: string }).csrfToken; }
  async login(email: string, password: string, extra: Record<string, string> = {}) {
    const csrfToken = await this.csrf();
    const response = await this.request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${this.base}/dashboard`, ...extra }) });
    return { response, data: await response.json() as { url: string } };
  }
  async session() { return await (await this.request('/api/auth/session')).json() as SessionResponse; }
  async logout() {
    return this.request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ csrfToken: await this.csrf(), callbackUrl: `${this.base}/login` }) });
  }
}

export async function runStaffHttpChecks(base: string): Promise<StaffFixture> {
  const salt = await Restaurant.findOne({ slug: 'salt' }).orFail();
  const other = await Restaurant.findOne({ slug: 'other' }).orFail();
  const password = randomBytes(24).toString('base64url');
  const owner = await createStaffUser({ restaurant: 'salt', name: 'Salt Owner', email: ' OWNER@SALT.LOCAL ', password, role: 'OWNER' });
  const staff = await createStaffUser({ restaurant: 'salt', name: 'Salt Staff', email: 'staff@salt.local', password, role: 'STAFF' });
  const browserUser = await createStaffUser({ restaurant: 'salt', name: 'Browser Staff', email: 'browser@salt.local', password, role: 'STAFF' });
  const inactive = await createStaffUser({ restaurant: 'salt', name: 'Inactive', email: 'inactive@salt.local', password, role: 'STAFF' });
  const foreign = await createStaffUser({ restaurant: 'other', name: 'Other Owner', email: 'other@other.local', password, role: 'OWNER' });
  await User.updateOne({ _id: inactive.id }, { $set: { isActive: false } });
  await assert.rejects(createStaffUser({ restaurant: 'salt', name: 'Duplicate', email: 'owner@SALT.local ', password, role: 'STAFF' }), { code: 11000 });
  assert.equal((await User.findById(owner.id).lean())?.passwordHash, undefined);
  assert.match((await User.findById(owner.id).select('+passwordHash').orFail()).passwordHash, /^\$2[aby]\$12\$/);

  const anonymous = new AuthClient(base);
  for (const path of ['/dashboard', '/dashboard/orders', '/dashboard/settings', `/dashboard?restaurantId=${salt._id}`]) {
    const response = await anonymous.request(path);
    await assertLoginRedirect(response);
  }
  assert.equal(await anonymous.session(), null);
  // Built-in CSRF is required for credential login.
  const noCsrf = await anonymous.request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ email: owner.email, password }) });
  assert.match((await noCsrf.json() as { url: string }).url, /MissingCSRF/);
  assert.equal(await anonymous.session(), null);
  for (const [email, candidate] of [[owner.email, 'wrong-password'], ['missing@salt.local', password], [inactive.email, password]]) {
    const rejected = await anonymous.login(email, candidate);
    assert.match(rejected.data.url, /error=CredentialsSignin/);
    assert.equal(await anonymous.session(), null);
  }

  const client = new AuthClient(base);
  const login = await client.login(' OWNER@SALT.LOCAL ', password, { restaurantId: String(other._id), role: 'STAFF', callbackUrl: 'https://evil.example/steal' });
  assert.equal(login.data.url, `${base}/dashboard`);
  const sessionCookie = login.response.headers.getSetCookie().find(cookie => cookie.includes('session-token='));
  assert.ok(sessionCookie); assert.match(sessionCookie, /HttpOnly/i); assert.match(sessionCookie, /Secure/i); assert.match(sessionCookie, /SameSite=Lax/i);
  const session = await client.session();
  assert.equal(session?.user?.id, owner.id); assert.equal(session?.user?.restaurantId, String(salt._id)); assert.equal(session?.user?.role, 'OWNER');
  assert.deepEqual(Object.keys(session!.user!).sort(), ['email', 'id', 'name', 'restaurantId', 'role']);
  assert.doesNotMatch(JSON.stringify(session), /passwordHash|authVersion/);
  const dashboard = await client.request(`/dashboard?restaurantId=${other._id}`);
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /data-testid="dashboard-restaurant"[^>]*><bdi>Salt<\/bdi>/);
  assert.doesNotMatch(html, /Private restaurant|TenantSecret|passwordHash/);
  const scope = { restaurantId: salt._id };
  const expected = {
    activeTables: await Table.countDocuments({ ...scope, isActive: true }),
    activeVisits: await TableSession.countDocuments({ ...scope, status: 'ACTIVE' }),
    newOrders: await Order.countDocuments({ ...scope, status: 'NEW' }),
    serviceCalls: await ServiceCall.countDocuments({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }),
  };
  for (const [key, value] of Object.entries(expected)) assert.match(html, new RegExp(`data-testid="metric-${key}"[^>]*>${value}<`));
  const update = await client.request('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csrfToken: await client.csrf(), data: { user: { restaurantId: String(other._id), id: foreign.id, role: 'OWNER' } } }) });
  assert.equal((await update.json() as SessionResponse)?.user?.restaurantId, String(salt._id), 'session update cannot inject tenant claims');
  const forged = new AuthClient(base);
  for (const [name, value] of client.cookies) forged.cookies.set(name, name.includes('session-token') ? value.slice(0, -4) + 'AAAA' : value);
  assert.equal(await forged.session(), null, 'tampered JWT rejected');

  // The same access is available to STAFF; a second tenant sees its own counts.
  const employee = new AuthClient(base);
  assert.equal((await employee.login(staff.email, password)).data.url, `${base}/dashboard`);
  assert.equal((await employee.session())?.user?.role, 'STAFF');
  assert.equal((await employee.request('/dashboard/products')).status, 200);
  const secondTenant = new AuthClient(base);
  await secondTenant.login(foreign.email, password);
  const foreignHtml = await (await secondTenant.request(`/dashboard?restaurantId=${salt._id}`)).text();
  assert.match(foreignHtml, /<bdi>Private restaurant<\/bdi>/);
  assert.match(foreignHtml, /data-testid="metric-activeTables"[^>]*>1</);
  assert.equal((await secondTenant.session())?.user?.restaurantId, String(other._id));

  // Active JWTs are checked against current database state on every protected read.
  await User.updateOne({ _id: staff.id }, { $set: { isActive: false } });
  await assertLoginRedirect(await employee.request('/dashboard'));
  assert.equal(await employee.session(), null);
  await User.updateOne({ _id: staff.id }, { $set: { isActive: true } });
  await employee.login(staff.email, password);
  await User.updateOne({ _id: staff.id }, { $set: { restaurantId: other._id } });
  assert.equal(await employee.session(), null, 'moving staff to another restaurant invalidates old claims');
  await User.updateOne({ _id: staff.id }, { $set: { restaurantId: salt._id } });
  await Restaurant.updateOne({ _id: other._id }, { $set: { isActive: false } });
  await assertLoginRedirect(await secondTenant.request('/dashboard'));
  assert.match((await secondTenant.login(foreign.email, password)).data.url, /error=CredentialsSignin/);
  await Restaurant.updateOne({ _id: other._id }, { $set: { isActive: true } });

  // CSRF-less logout must not revoke access. Valid logout revokes copied cookies too.
  const invalidLogout = await client.request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: 'callbackUrl=/login' });
  assert.match((await invalidLogout.json() as { url: string }).url, /MissingCSRF/);
  assert.equal((await client.session())?.user?.id, owner.id);
  const oldCookie = client.cookie();
  const logout = await client.logout();
  assert.equal((await logout.json() as { url: string }).url, `${base}/login`);
  assert.equal(await client.session(), null);
  await assertLoginRedirect(await client.request('/dashboard'));
  const replay = await fetch(`${base}/dashboard`, { redirect: 'manual', headers: { cookie: oldCookie } });
  await assertLoginRedirect(replay);
  console.log('PASS: Auth.js credentials, CSRF, generic failures, normalized unique email, OWNER/STAFF access, tenant isolation, forged claims, live account validity and logout revocation.');
  return { email: browserUser.email, password, restaurantId: browserUser.restaurantId, userId: browserUser.id };
}
