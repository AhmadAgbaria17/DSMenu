import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Restaurant, Table, TableSession, Product, Order } from '../src/models';
import { AuthClient, type StaffFixture } from './staff-http';
import { createStaffUser } from '../src/lib/staff-users';
import { tokenHash } from '../src/lib/customer-security';
import { defaultSelections } from '../src/lib/product-options';
import type { ManagedMenu } from '../src/types/menu-management';
import type { TableSnapshot } from '../src/types/tables';

export async function runTableAccessSettingChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', email: 'access-setting@salt.local', name: 'Access Settings', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('access-setting@salt.local', fixture.password);
  const settings = async () => (await (await staff.request('/api/dashboard/menu')).json() as ManagedMenu).restaurant;
  const initial = await settings();
  const fields = { name: initial.name, description: initial.description, phone: initial.phone, whatsapp: initial.whatsapp, address: initial.address, googleMapsUrl: initial.googleMapsUrl, instagramUrl: initial.instagramUrl, primaryColor: initial.primaryColor };
  const patch = (path: string, body: unknown, method = 'PATCH') => staff.request('/api/dashboard/' + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const toggle = (value: unknown) => patch('settings', { ...fields, tableAccessCodeEnabled: value });
  const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 420 });
  const path = base + '/api/r/salt/tables/420';
  const entry = async (cookie = '') => (await fetch(path + '/session', { headers: { cookie } })).json();
  const post = (part: string, body: unknown, cookie = '') => fetch(path + '/' + part, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const close = (id: string) => patch(`tables/${table._id}/close`, { sessionId: id }, 'POST');
  const row = async () => (await (await staff.request('/api/dashboard/tables')).json() as TableSnapshot).tables.find(t => t.id === String(table._id))!;
  const foreign = await Restaurant.findOne({ slug: 'other' }).lean().orFail();
  try {
    assert.equal(initial.tableAccessCodeEnabled, true);
    await Restaurant.collection.updateOne({ _id: table.restaurantId }, { $unset: { tableAccessCodeEnabled: '' } });
    assert.equal((await settings()).tableAccessCodeEnabled, true, 'legacy absence is enabled');
    assert.deepEqual(await entry(), { mode: 'CREATE' });
    assert.equal((await toggle('false')).status, 400);
    assert.equal((await patch('settings', { ...fields, tableAccessCodeEnabled: false, restaurantId: String(foreign._id) })).status, 400);
    assert.equal((await post('session', { action: 'OPEN', sessionId: null })).status, 403);
    assert.equal((await post('session', { action: 'OPEN', sessionId: null, accessCodeEnabled: false })).status, 400);
    const protectedEntry = await post('session', { action: 'CREATE', code: '527' }); assert.equal(protectedEntry.status, 200);
    const protectedId = (await protectedEntry.json()).visitId as string;
    assert.equal((await TableSession.findById(protectedId).orFail()).accessCodeRequired, true);
    assert.equal((await toggle(false)).status, 200);
    assert.deepEqual(await entry(), { mode: 'JOIN', sessionId: protectedId });
    assert.equal((await post('session', { action: 'OPEN', sessionId: protectedId })).status, 403);
    assert.equal((await row()).visit?.accessCode, '527');
    assert.equal((await post('session', { action: 'JOIN', sessionId: protectedId, code: '527' })).status, 200);
    // Missing legacy session snapshot must never be interpreted as unprotected.
    await TableSession.collection.updateOne({ _id: (await TableSession.findById(protectedId).orFail())._id }, { $unset: { accessCodeRequired: '' } });
    assert.deepEqual(await entry(), { mode: 'JOIN', sessionId: protectedId });
    assert.equal((await close(protectedId)).status, 200);
    assert.deepEqual(await entry(), { mode: 'OPEN', sessionId: null });
    assert.equal((await post('session', { action: 'CREATE', code: '000' })).status, 409, 'stale protected form cannot manufacture a code while off');
    const opened = await Promise.all([post('session', { action: 'OPEN', sessionId: null }), post('session', { action: 'OPEN', sessionId: null })]);
    for (const response of opened) assert.equal(response.status, 200);
    const ids = await Promise.all(opened.map(r => r.json() as Promise<{ visitId: string }>));
    assert.equal(ids[0].visitId, ids[1].visitId);
    const id = ids[0].visitId; const cookie = opened[0].headers.getSetCookie()[0].split(';')[0];
    assert.match(opened[0].headers.getSetCookie()[0], /HttpOnly/i); assert.match(opened[0].headers.getSetCookie()[0], /Secure/i); assert.match(opened[0].headers.getSetCookie()[0], /SameSite=lax/i);
    const visit = await TableSession.findById(id).select('+accessCode +credentials +codeAttemptCount').orFail();
    assert.equal(visit.accessCodeRequired, false); assert.equal(visit.accessCode, undefined); assert.equal(visit.codeAttemptCount, 0);
    assert.ok(visit.credentials.some(c => c.tokenHash === tokenHash(cookie.split('=')[1])));
    assert.equal((await row()).visit?.accessCode, null);
    assert.deepEqual(await entry(cookie), { mode: 'AUTHORIZED', visitId: id });
    assert.equal((await patch('settings', fields)).status, 200); assert.equal((await settings()).tableAccessCodeEnabled, false, 'older settings clients preserve the preference');
    assert.equal((await toggle(true)).status, 200);
    assert.deepEqual(await entry(), { mode: 'OPEN', sessionId: id });
    assert.equal((await post('session', { action: 'OPEN', sessionId: id })).status, 200);
    const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Cola', isAvailable: true }).orFail();
    const input = { clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, note: '', selections: defaultSelections(product.optionGroups.toObject()) }] };
    assert.equal((await post('orders', input)).status, 401);
    assert.equal((await post('service-calls', { type: 'WAITER' })).status, 401);
    const ordered = await post('orders', input, cookie); assert.equal(ordered.status, 200); const order = (await ordered.json()).order;
    assert.equal((await patch(`orders/${order.id}`, { expectedStatus: 'NEW', status: 'CANCELLED' })).status, 200);
    for (const type of ['WAITER', 'BILL', 'HELP']) {
      const call = await post('service-calls', { type }, cookie); assert.equal(call.status, 200);
      const body = await call.json();
      assert.equal((await patch(`service-calls/${body.call.id}`, { expectedStatus: 'PENDING', status: 'RESOLVED' })).status, 200);
    }
    assert.equal((await close(id)).status, 200);
    assert.equal((await fetch(path + '/orders', { headers: { cookie } })).status, 409);
    assert.equal(await Order.countDocuments({ _id: order.id }), 1);
    assert.deepEqual(await entry(), { mode: 'CREATE' });
    assert.equal((await post('session', { action: 'OPEN', sessionId: id })).status, 409);
    // Cleanup works without a code and the next session uses the latest setting.
    await toggle(false); const empty = await post('session', { action: 'OPEN', sessionId: null }); const emptyId = (await empty.json()).visitId;
    const emptyVisit = await TableSession.findById(emptyId).orFail();
    await TableSession.collection.updateOne({ _id: emptyVisit._id }, { $set: { createdAt: new Date(Date.now() - 121 * 60000), lastActivityAt: new Date(Date.now() - 121 * 60000) } });
    await toggle(true); assert.deepEqual(await entry(), { mode: 'CREATE' });
    assert.equal((await TableSession.findById(emptyId).orFail()).status, 'CLOSED');
    assert.deepEqual(await Restaurant.findById(foreign._id).lean(), foreign, 'settings never mutate another tenant');
    console.log('PASS: access-code settings persistence/defaults, protected/unprotected immutable snapshots, OPEN concurrency/credentials, server authority, orders/services, closure/cleanup and tenant isolation.');
  } finally { await toggle(initial.tableAccessCodeEnabled); }
}
