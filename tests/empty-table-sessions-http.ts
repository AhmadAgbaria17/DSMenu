import { tableAccessFetch as fetch } from './table-access-fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { defaultSelections } from '../src/lib/product-options';
import { Order, Product, Restaurant, ServiceCall, Table, TableSession, TakeawaySession } from '../src/models';
import { createStaffUser } from '../src/lib/staff-users';
import { AuthClient, type StaffFixture } from './staff-http';
import type { TableSnapshot } from '../src/types/tables';

export async function runEmptyTableSessionChecks(base: string, fixture: StaffFixture) {
  const cronPath = '/api/cron/empty-table-sessions';
  const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  const cleanup = () => fetch(base + cronPath, { headers });
  assert.equal((await fetch(base + cronPath)).status, 401);
  assert.equal((await fetch(base + cronPath, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(base + cronPath + '?restaurantId=' + fixture.restaurantId, { headers })).status, 400);
  await createStaffUser({ restaurant: 'salt', name: 'Cleanup Staff', email: 'cleanup@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('cleanup@salt.local', fixture.password);
  const post = (number: number, action: string, body: unknown, cookie = '') => fetch(`${base}/api/r/salt/tables/${number}/${action}`, { method: 'POST', headers: { Origin: base, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let tableNumber = 310;
  async function visit() {
    const number = tableNumber++;
    const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: number });
    const entry = await post(number, 'session', {}); assert.equal(entry.status, 200);
    const cookie = entry.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const session = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    return { number, table, session, cookie };
  }
  async function age(id: Types.ObjectId, minutes: number, activityMinutes = minutes) {
    await TableSession.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(Date.now() - minutes * 60_000), lastActivityAt: new Date(Date.now() - activityMinutes * 60_000) } });
  }
  const recent = await visit(); await age(recent.session._id, 119);
  const active = await visit(); await age(active.session._id, 180, 10);
  const allocated = await visit(); await age(allocated.session._id, 180);
  await TableSession.updateOne({ _id: allocated.session._id }, { $set: { nextOrderNumber: 1 } });
  const empty = await visit(); await age(empty.session._id, 121);
  const legacy = await visit(); await age(legacy.session._id, 121);
  await TableSession.collection.updateOne({ _id: legacy.session._id }, { $unset: { lastActivityAt: '', nextOrderNumber: '' } });
  const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const ordered = [];
  for (const status of ['NEW', 'READY', 'CANCELLED', 'SERVED'] as const) {
    const target = await visit(); await age(target.session._id, 180);
    const order = await Order.create({ restaurantId: fixture.restaurantId, tableId: target.table._id, tableSessionId: target.session._id, orderNumber: 1, idempotencyKey: randomUUID(), status, subtotal: 4800, items: [{ productId: product._id, nameAr: 'Burger', nameHe: 'Burger', nameEn: 'Burger', price: 4800, quantity: 1, itemTotal: 4800 }] });
    ordered.push({ ...target, order });
  }
  const calls = [];
  for (const status of ['PENDING', 'ACKNOWLEDGED', 'RESOLVED'] as const) {
    const target = await visit(); await age(target.session._id, 180);
    await ServiceCall.create({ restaurantId: fixture.restaurantId, tableId: target.table._id, tableSessionId: target.session._id, type: 'WAITER', status });
    calls.push({ ...target, status });
  }
  const other = await Restaurant.findOne({ slug: 'other' }).orFail();
  const foreignTable = await Table.create({ restaurantId: other._id, tableNumber: 310 });
  const foreign = await TableSession.create({ restaurantId: other._id, tableId: foreignTable._id }); await age(foreign._id, 180);
  const takeawayBefore = await TakeawaySession.find().lean();
  const ordersBefore = await Order.find().lean();
  // Lazy staff reads affect only the authenticated tenant.
  const snapshot = await (await staff.request('/api/dashboard/tables')).json() as TableSnapshot;
  assert.equal(snapshot.tables.find(t => t.id === String(empty.table._id))?.state, 'AVAILABLE');
  assert.equal((await TableSession.findById(foreign._id).orFail()).status, 'ACTIVE');
  assert.equal((await cleanup()).status, 200);
  const closed = await TableSession.findById(empty.session._id).orFail();
  assert.equal(closed.status, 'CLOSED'); assert.equal(closed.closeReason, 'AUTO_EMPTY_TIMEOUT'); assert.ok(closed.closedAt);
  assert.ok(closed.closedAt.getTime() >= closed.createdAt.getTime() + 120 * 60_000);
  for (const target of [recent, active, allocated, ...ordered, ...calls.filter(c => c.status !== 'RESOLVED')]) assert.equal((await TableSession.findById(target.session._id).orFail()).status, 'ACTIVE');
  for (const id of [legacy.session._id, foreign._id, calls[2].session._id]) assert.equal((await TableSession.findById(id).orFail()).status, 'CLOSED');
  assert.deepEqual(await Order.find().lean(), ordersBefore);
  assert.deepEqual(await TakeawaySession.find().lean(), takeawayBefore);
  const readyVisit = ordered.find(target => target.order.status === 'READY')!;
  const billPath = `/api/dashboard/tables/${readyVisit.table._id}/bill?sessionId=${readyVisit.session._id}`;
  const billBefore = await (await staff.request(billPath)).json();
  assert.equal((await cleanup()).status, 200);
  assert.deepEqual(await (await staff.request(billPath)).json(), billBefore);
  const manuallyClosed = await staff.request(`/api/dashboard/tables/${readyVisit.table._id}/close`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: String(readyVisit.session._id), billRevision: billBefore.revision }) });
  assert.equal(manuallyClosed.status, 200);
  assert.equal((await TableSession.findById(readyVisit.session._id).orFail()).closeReason, 'MANUAL');
  const input = { clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, note: '', selections: defaultSelections(product.optionGroups.toObject()) }] };
  assert.equal((await post(empty.number, 'orders', input, empty.cookie)).status, 409);
  assert.equal((await post(empty.number, 'service-calls', { type: 'WAITER' }, empty.cookie)).status, 409);
  const beforeRepeat = await TableSession.findById(empty.session._id).lean();
  assert.equal((await cleanup()).status, 200); assert.deepEqual(await TableSession.findById(empty.session._id).lean(), beforeRepeat);
  const reopened = await post(empty.number, 'session', {}, empty.cookie); assert.equal(reopened.status, 200);
  assert.notEqual((await reopened.json()).visitId, String(empty.session._id));
  assert.equal((await post(empty.number, 'orders', input, empty.cookie)).status, 409);
  // QR entry also performs cleanup without any scheduler or staff page.
  const lazy = await visit(); await age(lazy.session._id, 180);
  const fresh = await post(lazy.number, 'session', {}, lazy.cookie); assert.equal(fresh.status, 200);
  assert.notEqual((await fresh.json()).visitId, String(lazy.session._id));
  assert.equal((await TableSession.findById(lazy.session._id).orFail()).closeReason, 'AUTO_EMPTY_TIMEOUT');
  // Competing jobs and mutations must never commit a closed visit with a new
  // order or unresolved call. Either the close or the customer request wins.
  for (const action of ['orders', 'service-calls'] as const) {
    const target = await visit(); await age(target.session._id, 180);
    const response = await Promise.all([cleanup(), cleanup(), post(target.number, action, action === 'orders' ? { ...input, clientRequestId: randomUUID() } : { type: 'HELP' }, target.cookie)]);
    assert.equal(response[0].status, 200); assert.equal(response[1].status, 200);
    assert.ok([200, 409].includes(response[2].status));
    const result = await TableSession.findById(target.session._id).orFail();
    const count = action === 'orders' ? await Order.countDocuments({ tableSessionId: target.session._id }) : await ServiceCall.countDocuments({ tableSessionId: target.session._id });
    assert.equal(count, response[2].status === 200 ? 1 : 0);
    assert.equal(result.status, count ? 'ACTIVE' : 'CLOSED');
  }
  console.log('PASS: empty-session 120-minute/activity boundary, any-order protection, unresolved/resolved calls, historical closure, credential revocation/new QR visit, tenant-scoped lazy cleanup, authenticated scheduler, idempotency and concurrent order/service safety.');
}
