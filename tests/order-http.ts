import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Category, Order, Product, Restaurant, Table, TableSession } from '../src/models';
import { tokenHash, customerCookieName } from '../src/lib/customer-security';
import type { CustomerError, CustomerOrder } from '../src/types/orders';

type Body = { visitId?: string; order?: CustomerOrder; orders?: CustomerOrder[]; error?: CustomerError };
export async function runOrderHttpChecks(base: string) {
  async function request(path: string, body?: unknown, cookie = '', origin = base) {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Body, cookie: response.headers.get('set-cookie'), cache: response.headers.get('cache-control') };
  }
  const path = '/api/r/salt/tables/10';
  const restaurant = await Restaurant.findOne({ slug: 'salt' }).orFail();
  const table = await Table.findOne({ restaurantId: restaurant._id, tableNumber: 10 }).orFail();
  const burger = await Product.findOne({ restaurantId: restaurant._id, nameEn: 'Classic Burger' }).orFail();
  const cola = await Product.findOne({ restaurantId: restaurant._id, nameEn: 'Cola' }).orFail();
  const payload = () => ({ clientRequestId: randomUUID(), items: [{ productId: String(burger._id), quantity: 2, note: 'No onion' }, { productId: String(cola._id), quantity: 1, note: '' }] });

  const without = await request(`${path}/orders`, payload());
  assert.equal(without.status, 401, 'table number alone never authorizes an order');
  assert.equal((await request(`${path}/session`, {}, '', 'https://evil.example')).status, 403);
  assert.equal((await request('/api/r/salt/tables/07/session', {})).status, 400);
  assert.equal((await request('/api/r/salt/tables/99/session', {})).status, 404);
  const sessions = await Promise.all(Array.from({ length: 8 }, () => request(`${path}/session`, {})));
  for (const response of sessions) assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(new Set(sessions.map(response => response.body.visitId)).size, 1);
  assert.equal(await TableSession.countDocuments({ restaurantId: restaurant._id, tableId: table._id, status: 'ACTIVE' }), 1);
  const visitId = sessions[0].body.visitId!;
  const cookie = sessions[0].cookie!.split(';')[0];
  const rawToken = cookie.split('=')[1];
  assert.match(sessions[0].cookie!, /httponly/i); assert.match(sessions[0].cookie!, /secure/i); assert.match(sessions[0].cookie!, /samesite=lax/i);
  assert.match(sessions[0].cookie!, /Path=\/api\/r\/salt\/tables\/10/);
  assert.doesNotMatch(JSON.stringify(sessions[0].body), new RegExp(rawToken));
  const storedVisit = await TableSession.findById(visitId).select('+credentials').orFail();
  assert.ok(storedVisit.credentials.some(credential => credential.tokenHash === tokenHash(rawToken)));
  assert.equal(JSON.stringify(storedVisit).includes(rawToken), false);
  const reused = await request(`${path}/session`, {}, cookie);
  assert.equal(reused.body.visitId, visitId); assert.equal(reused.cookie, null);
  assert.equal((await TableSession.findById(visitId).orFail()).updatedAt.getTime(), storedVisit.updatedAt.getTime(), 'refresh causes no activity write');

  const first = payload();
  const created = await request(`${path}/orders`, { ...first, restaurantId: 'forged', tableId: 'forged', tableSessionId: 'forged', subtotal: 1, items: first.items.map(item => ({ ...item, price: 1, nameEn: 'Free food' })) }, cookie);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.ok(created.body.order); assert.equal(created.body.order.status, 'NEW'); assert.equal(created.body.order.orderNumber, 1);
  assert.equal(created.body.order.subtotal, burger.price * 2 + cola.price);
  const storedOrder = await Order.findById(created.body.order.id).orFail();
  assert.equal(String(storedOrder.restaurantId), String(restaurant._id)); assert.equal(String(storedOrder.tableSessionId), visitId);
  assert.equal(storedOrder.items[0].nameEn, 'Classic Burger');
  assert.ok((await TableSession.findById(visitId).orFail()).lastActivityAt);
  const second = await request(`${path}/orders`, payload(), cookie);
  assert.equal(second.body.order?.orderNumber, 2);
  const duplicate = await request(`${path}/orders`, first, cookie);
  assert.equal(duplicate.body.order?.id, created.body.order.id);
  assert.equal(await Order.countDocuments({ tableSessionId: visitId }), 2);
  assert.equal((await request(`${path}/orders`, { ...first, items: [{ ...first.items[0], quantity: 3 }] }, cookie)).status, 409);

  const concurrentPayload = payload();
  const concurrentSame = await Promise.all(Array.from({ length: 6 }, () => request(`${path}/orders`, concurrentPayload, cookie)));
  for (const result of concurrentSame) assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(new Set(concurrentSame.map(result => result.body.order?.id)).size, 1);
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => request(`${path}/orders`, payload(), cookie)));
  for (const result of concurrent) assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(concurrent.map(result => result.body.order!.orderNumber).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
  assert.equal((await TableSession.findById(visitId).orFail()).nextOrderNumber, 9);

  const beforeRejected = await Order.countDocuments({ tableSessionId: visitId });
  const invalidPayloads = [
    { ...payload(), items: [] },
    ...[0, 100, -1, 1.5, '2'].map(quantity => ({ ...payload(), items: [{ ...first.items[0], quantity }] })),
    { ...payload(), items: [{ ...first.items[0], note: 'x'.repeat(301) }] },
    { ...payload(), items: [{ ...first.items[0], productId: 'invalid' }] },
  ];
  for (const invalid of invalidPayloads) assert.equal((await request(`${path}/orders`, invalid, cookie)).status, 400);
  const foreign = await Product.findOne({ nameEn: 'TenantSecretProduct' }).orFail();
  const crossed = await Product.findOne({ nameEn: 'CrossTenantReference' }).orFail();
  const unavailable = await Product.findOne({ restaurantId: restaurant._id, isAvailable: false }).orFail();
  for (const productId of [String(foreign._id), String(crossed._id), String(unavailable._id), '000000000000000000000999']) {
    const bad = await request(`${path}/orders`, { ...payload(), items: [...first.items, { productId, quantity: 1, note: '' }] }, cookie);
    assert.equal(bad.status, 422); assert.deepEqual(bad.body.error?.itemIds, [productId]);
  }
  await Product.updateOne({ _id: burger._id }, { $set: { isAvailable: false } });
  assert.equal((await request(`${path}/orders`, payload(), cookie)).status, 422);
  assert.equal((await request(`${path}/orders`, first, cookie)).body.order?.id, created.body.order.id, 'retry still succeeds after product changes');
  await Product.updateOne({ _id: burger._id }, { $set: { isAvailable: true, isArchived: true } });
  assert.equal((await request(`${path}/orders`, payload(), cookie)).status, 422);
  await Product.updateOne({ _id: burger._id }, { $set: { isArchived: false } });
  await Category.updateOne({ _id: burger.categoryId }, { $set: { isActive: false } });
  assert.equal((await request(`${path}/orders`, payload(), cookie)).status, 422);
  await Category.updateOne({ _id: burger.categoryId }, { $set: { isActive: true } });
  const deleted = await Product.create({ restaurantId: restaurant._id, categoryId: burger.categoryId, nameAr: 'أ', nameHe: 'א', nameEn: 'Deleted', price: 100 });
  await Product.deleteOne({ _id: deleted._id });
  assert.equal((await request(`${path}/orders`, { ...payload(), items: [{ productId: String(deleted._id), quantity: 1, note: '' }] }, cookie)).status, 422);
  await Product.updateOne({ _id: burger._id }, { $set: { price: 100_000_000 } });
  assert.equal((await request(`${path}/orders`, payload(), cookie)).body.error?.code, 'ORDER_LIMIT');
  await Product.updateOne({ _id: burger._id }, { $set: { price: burger.price } });
  assert.equal(await Order.countDocuments({ tableSessionId: visitId }), beforeRejected, 'all-or-nothing rejection');
  assert.equal((await TableSession.findById(visitId).orFail()).nextOrderNumber, 9, 'rejections never consume order numbers');

  await Product.updateOne({ _id: burger._id }, { $set: { price: 5200, nameEn: 'Updated Burger' } });
  const updated = await request(`${path}/orders`, payload(), cookie);
  assert.equal(updated.body.order?.subtotal, 5200 * 2 + cola.price);
  assert.equal((await Order.findById(created.body.order.id).orFail()).items[0].price, 4800);
  assert.equal((await Order.findById(created.body.order.id).orFail()).items[0].nameEn, 'Classic Burger');
  await Product.updateOne({ _id: burger._id }, { $set: { price: burger.price, nameEn: burger.nameEn } });
  const history = await request(`${path}/orders`, undefined, cookie);
  assert.equal(history.body.orders?.length, 10); assert.equal(history.body.orders?.[0].orderNumber, 10);
  assert.match(history.cache!, /no-store/);
  assert.doesNotMatch(JSON.stringify(history.body), /tokenHash|credentials|requestFingerprint|idempotencyKey/);
  assert.equal((await request(`${path}/orders`)).status, 401);
  assert.equal((await request(`${path}/orders?sessionId=${visitId}`, undefined, cookie)).status, 400);
  assert.equal((await request(`${path}/orders`, undefined, cookie.replace(rawToken, 'a'.repeat(43)))).status, 401);
  const otherSession = await request('/api/r/salt/tables/11/session', {});
  const otherCookie = otherSession.cookie!.split(';')[0];
  assert.equal((await request('/api/r/salt/tables/11/orders', undefined, otherCookie)).body.orders?.length, 0);
  const stolenScopeCookie = `${customerCookieName(String(restaurant._id), 11)}=${rawToken}`;
  assert.equal((await request('/api/r/salt/tables/11/orders', undefined, stolenScopeCookie)).status, 401);
  const otherRestaurant = await Restaurant.findOne({ slug: 'other' }).orFail();
  assert.equal((await request('/api/r/other/tables/99/orders', undefined, `${customerCookieName(String(otherRestaurant._id), 99)}=${rawToken}`)).status, 401);

  await TableSession.updateOne({ _id: visitId }, { $set: { status: 'CLOSED', closedAt: new Date() } });
  assert.equal((await request(`${path}/orders`, payload(), cookie)).body.error?.code, 'SESSION_CLOSED');
  assert.equal((await request(`${path}/orders`, first, cookie)).body.error?.code, 'SESSION_CLOSED');
  assert.equal((await request(`${path}/orders`, undefined, cookie)).status, 409);
  const nextVisit = await request(`${path}/session`, {}, cookie);
  assert.equal(nextVisit.status, 200); assert.notEqual(nextVisit.body.visitId, visitId);
  assert.equal(await TableSession.countDocuments({ tableId: table._id, status: 'ACTIVE' }), 1);
  assert.equal(await Order.countDocuments({ tableSessionId: visitId }), 10, 'closed history remains');
  const nextCookie = nextVisit.cookie!.split(';')[0];
  await TableSession.updateOne({ _id: nextVisit.body.visitId }, { $set: { 'credentials.0.expiresAt': new Date(0) } });
  assert.equal((await request(`${path}/orders`, payload(), nextCookie)).status, 401, 'expired credentials cannot order');

  // Force an insert failure after allocation. Both attempts must roll back the counter.
  const rollbackPath = '/api/r/salt/tables/14';
  const rollbackVisit = await request(`${rollbackPath}/session`, {});
  const rollbackTable = await Table.findOne({ restaurantId: restaurant._id, tableNumber: 14 }).orFail();
  const collision = await Order.create({ restaurantId: restaurant._id, tableId: rollbackTable._id,
    tableSessionId: rollbackVisit.body.visitId, orderNumber: 1, idempotencyKey: randomUUID(),
    items: storedOrder.items, subtotal: storedOrder.subtotal, currency: 'ILS' });
  const rollback = await request(`${rollbackPath}/orders`, payload(), rollbackVisit.cookie!.split(';')[0]);
  assert.equal(rollback.status, 503);
  assert.equal((await TableSession.findById(rollbackVisit.body.visitId).orFail()).nextOrderNumber, 0, 'failed insert rolls back allocation');
  assert.equal(await Order.countDocuments({ tableSessionId: rollbackVisit.body.visitId }), 1);
  await Order.deleteOne({ _id: collision._id });
  assert.equal((await request(`${rollbackPath}/orders`, payload(), rollbackVisit.cookie!.split(';')[0])).body.order?.orderNumber, 1);
  console.log('PASS: Phase 3 secure sessions, races, scoped credentials, authoritative prices, transaction counters, idempotency, validation, snapshots, history and closed/expired sessions.');
}
