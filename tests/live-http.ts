import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { AuthClient, type StaffFixture } from './staff-http';
import { realtimeTest } from './realtime-transport';
import { Order, Product, Restaurant, Table, TableSession, User } from '../src/models';
import { restaurantChannel, visitChannel } from '../src/lib/realtime-channels';
import type { CustomerOrder } from '../src/types/orders';
import type { LiveOrdersSnapshot } from '../src/types/live-orders';

export async function runLiveHttpChecks(base: string, fixture: StaffFixture) {
  const client = new AuthClient(base);
  await client.login(fixture.email, fixture.password);
  const anonymous = await fetch(`${base}/api/dashboard/orders`);
  assert.equal(anonymous.status, 401);
  const other = await Restaurant.findOne({ slug: 'other' }).orFail();
  const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  async function customer(path: string, body: unknown, cookie = '') {
    return fetch(`${base}${path}`, { method: 'POST', headers: { cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  const endpoint = '/api/r/salt/tables/15';
  const session = await customer(`${endpoint}/session`, {});
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const { visitId } = await session.json() as { visitId: string };
  const input = () => ({ clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, note: 'Test note' }] });
  const payload = input();
  const before = realtimeTest.events.length;
  const response = await customer(`${endpoint}/orders`, payload, cookie);
  assert.equal(response.status, 200);
  const { order } = await response.json() as { order: CustomerOrder };
  assert.equal(realtimeTest.events.length, before + 1, 'one notification after a new order');
  const event = realtimeTest.events.at(-1)!;
  assert.equal(event.name, 'order.created');
  assert.deepEqual(event.channels, [restaurantChannel(fixture.restaurantId), visitChannel(visitId)]);
  assert.deepEqual(JSON.parse(event.data), { version: 1 }, 'payload contains no business data or credentials');
  assert.ok(event.committed.some(item => item.id === order.id && item.status === 'NEW'), 'publish sees committed order');
  assert.equal((await customer(`${endpoint}/orders`, payload, cookie)).status, 200);
  assert.equal(realtimeTest.events.length, before + 1, 'idempotent retry does not publish another created event');
  const invalid = await customer(`${endpoint}/orders`, { ...input(), items: [] }, cookie);
  assert.equal(invalid.status, 400); assert.equal(realtimeTest.events.length, before + 1);

  const socket = '42.123';
  const staffChannel = restaurantChannel(fixture.restaurantId);
  async function staffAuth(channel: string) {
    return client.request('/api/dashboard/realtime', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ socket_id: socket, channel_name: channel, restaurantId: String(other._id) }) });
  }
  const authorized = await staffAuth(staffChannel);
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json() as { auth: string }).auth, `${process.env.REALTIME_KEY}:${createHmac('sha256', process.env.REALTIME_SECRET!).update(`${socket}:${staffChannel}`).digest('hex')}`);
  assert.equal((await staffAuth(restaurantChannel(String(other._id)))).status, 403);
  assert.equal((await staffAuth(visitChannel(visitId))).status, 403);
  const authInput = { socket_id: socket, channel_name: visitChannel(visitId) };
  assert.equal((await customer(`${endpoint}/realtime`, authInput)).status, 401);
  assert.equal((await customer(`${endpoint}/realtime`, authInput, cookie)).status, 200);
  assert.equal((await customer(`${endpoint}/realtime`, { ...authInput, channel_name: staffChannel }, cookie)).status, 403);
  assert.equal((await customer(`${endpoint}/realtime`, { ...authInput, channel_name: visitChannel('000000000000000000000001') }, cookie)).status, 403);
  assert.equal((await customer('/api/r/salt/tables/1/realtime', authInput, cookie)).status, 401);

  async function update(id: string, expectedStatus: string, status: string, origin = base) {
    return client.request(`/api/dashboard/orders/${id}`, { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus, status, restaurantId: String(other._id) }) });
  }
  assert.equal((await update(order.id, 'NEW', 'SERVED')).status, 422);
  assert.equal((await update('not-an-id', 'NEW', 'ACCEPTED')).status, 400);
  assert.equal((await update(order.id, 'NEW', 'ACCEPTED', 'https://evil.example')).status, 403);
  for (const [from, to, timestamp] of [['NEW', 'ACCEPTED', 'acceptedAt'], ['ACCEPTED', 'PREPARING', 'preparingAt'], ['PREPARING', 'READY', 'readyAt'], ['READY', 'SERVED', 'servedAt']]) {
    const changed = await update(order.id, from, to);
    assert.equal(changed.status, 200, await changed.text());
    const stored = await Order.findById(order.id).orFail();
    assert.equal(stored.status, to); assert.ok(stored.get(timestamp) instanceof Date);
    const notice = realtimeTest.events.at(-1)!;
    assert.equal(notice.name, 'order.status.updated');
    assert.ok(notice.committed.some(item => item.id === order.id && item.status === to), 'status is committed before event');
  }
  assert.equal((await update(order.id, 'SERVED', 'NEW')).status, 422);
  assert.equal((await update(order.id, 'READY', 'SERVED')).status, 409);
  const history = await (await client.request(`/api/dashboard/orders?restaurantId=${other._id}`)).json() as LiveOrdersSnapshot;
  assert.equal(history.orders.find(item => item.id === order.id)?.status, 'SERVED');
  assert.equal(await Order.countDocuments({ _id: order.id }), 1);

  const foreignTable = await Table.findOne({ restaurantId: other._id }).orFail();
  const foreignVisit = await TableSession.findOne({ restaurantId: other._id, tableId: foreignTable._id, status: 'ACTIVE' }) ?? await TableSession.create({ restaurantId: other._id, tableId: foreignTable._id });
  const foreignOrder = await Order.create({ restaurantId: other._id, tableId: foreignTable._id, tableSessionId: foreignVisit._id, orderNumber: 500, idempotencyKey: randomUUID(), items: (await Order.findById(order.id).orFail()).items, subtotal: order.subtotal });
  assert.equal((await update(String(foreignOrder._id), 'NEW', 'ACCEPTED')).status, 404);
  assert.equal((await update('000000000000000000000001', 'NEW', 'ACCEPTED')).status, 404);
  const own = await (await client.request('/api/dashboard/orders')).json() as LiveOrdersSnapshot;
  assert.equal(own.orders.some(item => item.id === String(foreignOrder._id)), false);
  assert.equal(own.orders.find(item => item.id === order.id)?.tableNumber, 15);

  const racing = await (await customer(`${endpoint}/orders`, input(), cookie)).json() as { order: CustomerOrder };
  const races = await Promise.all([update(racing.order.id, 'NEW', 'ACCEPTED'), update(racing.order.id, 'NEW', 'CANCELLED')]);
  assert.deepEqual(races.map(result => result.status).sort(), [200, 409]);
  const cancel = await (await customer(`${endpoint}/orders`, input(), cookie)).json() as { order: CustomerOrder };
  assert.equal((await update(cancel.order.id, 'NEW', 'ACCEPTED')).status, 200);
  assert.equal((await update(cancel.order.id, 'ACCEPTED', 'CANCELLED')).status, 200);
  assert.equal((await update(cancel.order.id, 'CANCELLED', 'PREPARING')).status, 422);

  realtimeTest.failNext = true;
  const failedPublish = await customer(`${endpoint}/orders`, input(), cookie);
  assert.equal(failedPublish.status, 200, 'publish failure cannot undo order creation');
  const failureOrder = (await failedPublish.json() as { order: CustomerOrder }).order;
  realtimeTest.failNext = true;
  assert.equal((await update(failureOrder.id, 'NEW', 'ACCEPTED')).status, 200);
  assert.equal((await Order.findById(failureOrder.id).orFail()).status, 'ACCEPTED');
  await TableSession.updateOne({ _id: visitId }, { $set: { status: 'CLOSED', closedAt: new Date() } });
  assert.equal((await customer(`${endpoint}/realtime`, authInput, cookie)).status, 409);
  await User.updateOne({ _id: fixture.userId }, { $set: { isActive: false } });
  assert.equal((await staffAuth(staffChannel)).status, 401);
  await User.updateOne({ _id: fixture.userId }, { $set: { isActive: true } });
  console.log('PASS: private realtime authorization, tenant-isolated orders, atomic transitions, timestamps, history, post-commit signals and notification failure resilience.');
}
