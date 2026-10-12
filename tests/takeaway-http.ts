import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthClient, type StaffFixture } from './staff-http';
import { Order, Product, TakeawaySession, Restaurant, TableSession } from '../src/models';
import { migrateOrderIndexes } from '../src/lib/order-indexes';
import { tokenHash } from '../src/lib/customer-security';
import { defaultSelections } from '../src/lib/product-options';
import { optionFixture } from './option-fixture';
import { realtimeTest } from './realtime-transport';
import { createStaffUser } from '../src/lib/staff-users';
import type { CustomerOrder } from '../src/types/orders';
import type { LiveOrdersSnapshot } from '../src/types/live-orders';
import type { AnalyticsDto } from '../src/types/analytics';

export async function runTakeawayHttpChecks(base: string, fixture: StaffFixture) {
  const path = '/api/r/salt/takeaway';
  const request = (route: string, body?: unknown, cookie = '', origin = base) => fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const identity = { customerName: ' Ahmad ', customerPhone: '050-1234567' };
  // Simulate the pre-upgrade database with real historical table orders.
  const before = await Order.countDocuments();
  await Order.collection.createIndex({ tableSessionId: 1, orderNumber: 1 }, { unique: true, name: 'tableSessionId_1_orderNumber_1' });
  await Order.collection.createIndex({ restaurantId: 1, tableSessionId: 1, idempotencyKey: 1 }, { unique: true, name: 'restaurantId_1_tableSessionId_1_idempotencyKey_1' });
  assert.equal((await request(`${path}/session`, identity)).status, 503, 'fail closed until legacy constraints are replaced');
  await migrateOrderIndexes(); await migrateOrderIndexes(); assert.equal(await Order.countDocuments(), before);
  const indexes = await Order.collection.indexes(); assert.ok(indexes.some(i => i.name === 'table_order_number' && i.unique)); assert.ok(!indexes.some(i => i.name === 'tableSessionId_1_orderNumber_1'));
  const html = await (await fetch(`${base}/r/salt?mode=takeaway`, { headers: { cookie: 'dsmenu-language=en' } })).text(); assert.doesNotMatch(html, /data-product-id=|id="choose-table"/);
  for (const invalid of [{}, { customerName: 'Ahmad' }, { customerPhone: '0501234567' }, { ...identity, customerPhone: 'bad' }]) assert.equal((await request(`${path}/session`, invalid)).status, 400);
  assert.equal((await request(`${path}/session`, identity, '', 'https://evil.example')).status, 403);
  assert.equal((await request(`${path}/orders`)).status, 401);
  const tableCount = await TableSession.countDocuments();
  const established = await request(`${path}/session`, identity); assert.equal(established.status, 200);
  const visitId = (await established.json()).visitId as string; const header = established.headers.get('set-cookie')!; const cookie = header.split(';')[0]; const raw = cookie.split('=')[1];
  assert.match(header, /HttpOnly/i); assert.match(header, /Secure/i); assert.match(header, /SameSite=Lax/i); assert.match(header, /Path=\/api\/r\/salt\/takeaway/);
  const stored = await TakeawaySession.findById(visitId).select('+tokenHash').orFail(); assert.equal(stored.tokenHash, tokenHash(raw)); assert.ok(!JSON.stringify(stored).includes(raw)); assert.equal(stored.customerName, 'Ahmad'); assert.equal(stored.customerPhone, '0501234567');
  assert.equal(await TableSession.countDocuments(), tableCount);
  const resumed = await request(`${path}/session`, undefined, cookie); assert.equal((await resumed.json()).visitId, visitId); assert.equal(resumed.headers.get('set-cookie'), null);
  const reused = await request(`${path}/session`, identity, cookie); assert.equal((await reused.json()).visitId, visitId);
  const another = await request(`${path}/session`, identity); const secondId = (await another.json()).visitId as string; const secondCookie = another.headers.get('set-cookie')!.split(';')[0]; assert.notEqual(secondId, visitId, 'names are not identity');
  assert.equal((await request('/api/r/other/takeaway/orders', undefined, cookie.replace('dsmenu-takeaway-salt', 'dsmenu-takeaway-other'))).status, 401);
  assert.equal((await request('/api/r/salt/tables/7/orders', undefined, `dsmenu-visit-${fixture.restaurantId}-7=${raw}`)).status, 401);
  const tableSession = await request('/api/r/salt/tables/7/session', {}); const tableToken = tableSession.headers.get('set-cookie')!.split(';')[0].split('=')[1]; assert.equal((await request(`${path}/orders`, undefined, `dsmenu-takeaway-salt=${tableToken}`)).status, 401);
  const burger = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail(); const previous = { optionGroups: burger.optionGroups.toObject(), price: burger.price };
  const groups = optionFixture(); await Product.updateOne({ _id: burger._id }, { $set: { optionGroups: groups, price: 4800 } });
  await createStaffUser({ restaurant: 'salt', name: 'Takeaway staff', email: 'takeaway@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('takeaway@salt.local', fixture.password);
  try {
    const choices = defaultSelections(groups); choices[0].optionIds.splice(1, 1); choices[1].optionIds = [groups[1].options[0].id]; choices[2].optionIds = [groups[2].options[1].id];
    const input = { takeawayVisitId: visitId, clientRequestId: randomUUID(), items: [{ productId: String(burger._id), quantity: 2, note: 'Takeaway security', selections: choices, price: 1 }], customerName: 'Spoofed', customerPhone: '0000000', fulfillmentType: 'TABLE', subtotal: 1 };
    const eventsBefore = realtimeTest.events.length;
    const concurrent = await Promise.all([request(`${path}/orders`, input, cookie), request(`${path}/orders`, input, cookie)]); for (const r of concurrent) assert.equal(r.status, 200);
    const order = (await concurrent[0].json()).order as CustomerOrder; assert.equal((await concurrent[1].json()).order.id, order.id); assert.equal(order.fulfillmentType, 'TAKEAWAY'); assert.equal(order.subtotal, 10600); assert.equal(order.orderNumber, 1);
    assert.equal((await request(`${path}/orders`, { ...input, items: [] }, cookie)).status, 400);
    const invalid = await request(`${path}/orders`, { ...input, clientRequestId: randomUUID(), items: [{ ...input.items[0], selections: [] }] }, cookie); assert.equal(invalid.status, 422);
    const foreign = await Product.findOne({ restaurantId: { $ne: fixture.restaurantId } }).orFail(); assert.equal((await request(`${path}/orders`, { ...input, clientRequestId: randomUUID(), items: [{ productId: String(foreign._id), quantity: 1, note: '' }] }, cookie)).status, 422);
    const second = await request(`${path}/orders`, { ...input, takeawayVisitId: secondId }, secondCookie); assert.equal(second.status, 200); assert.equal((await second.json()).order.orderNumber, 1);
    assert.equal((await request(`${path}/orders`, input, secondCookie)).status, 409, 'another tab cannot send an old visit cart under a new credential');
    const db = await Order.findById(order.id).orFail(); assert.equal(db.tableId, undefined); assert.equal(db.tableSessionId, undefined); assert.equal(db.customerName, 'Ahmad'); assert.equal(db.customerPhone, '0501234567'); assert.equal(String(db.takeawaySessionId), visitId);
    assert.ok(realtimeTest.events.slice(eventsBefore).every(event => event.data === '{"version":1}')); assert.ok(realtimeTest.events.some(event => event.committed.some(o => o.id === order.id)));
    const history = await (await request(`${path}/orders`, undefined, cookie)).json(); assert.equal(history.orders.length, 1); assert.doesNotMatch(JSON.stringify(history), /customerName|customerPhone|tokenHash/);
    const auth = { socket_id: '12.34', channel_name: `private-takeaway-session-${visitId}` };
    assert.equal((await request(`${path}/realtime`, auth, cookie)).status, 200);
    for (const channel of [`private-takeaway-session-${secondId}`, `private-restaurant-${fixture.restaurantId}`, `private-table-session-${visitId}`]) assert.equal((await request(`${path}/realtime`, { ...auth, channel_name: channel }, cookie)).status, 403);
    const dashboard = await (await staff.request('/api/dashboard/orders')).json() as LiveOrdersSnapshot; const visible = dashboard.orders.find(o => o.id === order.id)!; assert.equal(visible.customerName, 'Ahmad'); assert.equal(visible.customerPhone, '0501234567'); assert.equal(visible.tableSessionId, null);
    const other = new AuthClient(base); await createStaffUser({ restaurant: 'other', name: 'Foreign takeaway', email: 'takeaway@other.local', password: fixture.password, role: 'OWNER' }); await other.login('takeaway@other.local', fixture.password); assert.ok(!(await (await other.request('/api/dashboard/orders')).text()).includes(order.id));
    const analyticsBefore = await (await staff.request('/api/dashboard/analytics?range=today')).json() as AnalyticsDto;
    let expectedStatus = 'NEW';
    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
      const response = await staff.request(`/api/dashboard/orders/${order.id}`, { method: 'PATCH', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus, status }) }); assert.equal(response.status, 200); expectedStatus = status;
      assert.equal((await (await request(`${path}/orders`, undefined, cookie)).json()).orders[0].status, status);
    }
    const analyticsAfter = await (await staff.request('/api/dashboard/analytics?range=today')).json() as AnalyticsDto; assert.equal(analyticsAfter.summary.completedValue - analyticsBefore.summary.completedValue, 10600); assert.equal(analyticsAfter.summary.orderedTables, analyticsBefore.summary.orderedTables); assert.ok(!analyticsAfter.tables.some(t => t.id === 'null' || t.id === 'undefined'));
    await Product.updateOne({ _id: burger._id }, { $set: { price: 9900 } }); assert.equal((await Order.findById(order.id).orFail()).items[0].price, 5300);
    await TakeawaySession.updateOne({ _id: visitId }, { $set: { expiresAt: new Date(0) } }); assert.equal((await request(`${path}/orders`, input, cookie)).status, 401); assert.equal((await request(`${path}/realtime`, auth, cookie)).status, 401);
    assert.equal(await Order.countDocuments({ _id: order.id }), 1);
    await Restaurant.updateOne({ _id: fixture.restaurantId }, { $set: { isActive: false } }); assert.equal((await request(`${path}/session`, identity)).status, 404); await Restaurant.updateOne({ _id: fixture.restaurantId }, { $set: { isActive: true } });
    console.log('PASS: safe legacy index migration, takeaway identity/credential/expiry, scope isolation, shared options/pricing, idempotency races, historical snapshots, private realtime/staff DTOs, status lifecycle and analytics.');
  } finally { await Product.updateOne({ _id: burger._id }, { $set: previous }); await Restaurant.updateOne({ _id: fixture.restaurantId }, { $set: { isActive: true } }); }
}
