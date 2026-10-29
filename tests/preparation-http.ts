import { tableAccessFetch as fetch } from './table-access-fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AuthClient, type StaffFixture } from './staff-http';
import { createStaffUser } from '../src/lib/staff-users';
import { Order, Table, TableSession, Product, Restaurant } from '../src/models';
import { defaultSelections } from '../src/lib/product-options';
import { realtimeTest } from './realtime-transport';
import type { CustomerOrder } from '../src/types/orders';
import type { TableSessionBill } from '../src/types/table-bill';
import type { AnalyticsDto } from '../src/types/analytics';

export async function runPreparationHttpChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Preparation Staff', email: 'preparation@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('preparation@salt.local', fixture.password);
  assert.equal((await staff.session())?.user?.restaurantId, fixture.restaurantId);
  const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 206 });
  const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const customer = (part: string, body: unknown, cookie = '') => fetch(`${base}/api/r/salt/tables/206/${part}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const entry = await customer('session', {}); assert.equal(entry.status, 200);
  const cookie = entry.headers.get('set-cookie')!.split(';')[0];
  const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
  const submit = async () => {
    const response = await customer('orders', { clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, note: 'Batch snapshot', selections: defaultSelections(product.optionGroups.toObject()) }] }, cookie);
    assert.equal(response.status, 200); return (await response.json() as { order: CustomerOrder }).order;
  };
  const patch = (ids: string[], expectedStatus = 'NEW', status = 'PREPARING', origin = base, extra = {}) => staff.request('/api/dashboard/orders/preparation', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIds: ids, expectedStatus, status, ...extra }) });
  const first = await submit(); const second = await submit();
  // Reproduce the exact hot-reload failure against real MongoDB, then roll back.
  const legacySchema = Order.schema.clone();
  legacySchema.remove('preparationBatchId');
  const LegacyOrder = mongoose.model('LegacyOrderSchemaRegression', legacySchema, Order.collection.name);
  const rollback = new Error('Rollback stale schema regression fixture');
  try {
    await assert.rejects(mongoose.connection.transaction(async transaction => {
      await LegacyOrder.updateMany({ _id: { $in: [first.id, second.id] } }, { $set: { status: 'PREPARING', preparationBatchId: new mongoose.Types.ObjectId() } }, { session: transaction });
      const split = await Order.find({ _id: { $in: [first.id, second.id] } }).session(transaction).lean();
      assert.ok(split.every(order => order.status === 'PREPARING' && !order.preparationBatchId), 'stale schemas silently save status without identity');
      throw rollback;
    }), error => error === rollback);
    await assert.rejects(LegacyOrder.updateMany({ _id: first.id }, { $set: { status: 'PREPARING', preparationBatchId: new mongoose.Types.ObjectId() } }, { strict: 'throw' }), { name: 'StrictModeError' });
    assert.equal((await Order.findById(first.id).orFail()).status, 'NEW', 'strict writes cannot leave a split group');
  } finally { mongoose.deleteModel('LegacyOrderSchemaRegression'); }
  assert.equal((await fetch(base + '/api/dashboard/orders/preparation', { method: 'PATCH', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIds: [first.id], expectedStatus: 'NEW', status: 'PREPARING' }) })).status, 401);
  assert.equal((await patch([first.id], 'NEW', 'PREPARING', 'https://evil.example')).status, 403);
  assert.equal((await patch([first.id], 'NEW', 'READY')).status, 400);
  assert.equal((await patch([first.id], 'NEW', 'PREPARING', base, { restaurantId: fixture.restaurantId })).status, 400);
  const original = await Order.findById(first.id).lean().orFail();
  const foreign = await Restaurant.findOne({ slug: 'other' }).orFail();
  const foreignTable = await Table.findOne({ restaurantId: foreign._id }).orFail();
  const clone = async (values: Record<string, unknown>) => Order.create({ restaurantId: fixture.restaurantId, tableId: table._id, tableSessionId: visit._id, orderNumber: 90, idempotencyKey: randomUUID(), items: original.items, subtotal: original.subtotal, ...values });
  const foreignOrder = await clone({ restaurantId: foreign._id, tableId: foreignTable._id, tableSessionId: new TableSession()._id });
  const oldSessionOrder = await clone({ tableSessionId: new TableSession()._id });
  const otherTableOrder = await clone({ tableId: foreignTable._id, orderNumber: 91 });
  const takeawayOrder = await clone({ fulfillmentType: 'TAKEAWAY', tableId: undefined, tableSessionId: undefined, takeawaySessionId: new TableSession()._id, customerName: 'Takeaway Test', customerPhone: '0501234567' });
  for (const invalid of [foreignOrder, oldSessionOrder, otherTableOrder, takeawayOrder]) {
    assert.equal((await patch([first.id, String(invalid._id)])).status, 404);
    assert.equal((await Order.findById(first.id).orFail()).status, 'NEW', 'invalid member never partially updates');
  }
  await Order.deleteOne({ _id: otherTableOrder._id }); // Remove deliberately inconsistent test fixture.
  const beforeEvents = realtimeTest.events.length;
  const races = await Promise.all([patch([first.id, second.id]), patch([first.id, second.id])]);
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);
  const prepared = await Order.find({ _id: { $in: [first.id, second.id] } }).sort({ orderNumber: 1 }).lean();
  assert.ok(prepared.every(order => order.status === 'PREPARING'));
  assert.equal(String(prepared[0].preparationBatchId), String(prepared[1].preparationBatchId));
  assert.equal(prepared[0].preparingAt?.getTime(), prepared[1].preparingAt?.getTime());
  assert.equal(realtimeTest.events.length, beforeEvents + 1);
  assert.deepEqual(JSON.parse(realtimeTest.events.at(-1)!.data), { version: 1 });
  for (const id of [first.id, second.id]) assert.ok(realtimeTest.events.at(-1)!.committed.some(order => order.id === id && order.status === 'PREPARING'));
  const bypass = await staff.request(`/api/dashboard/orders/${first.id}`, { method: 'PATCH', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: 'PREPARING', status: 'READY' }) });
  assert.equal(bypass.status, 409, 'single-order endpoint cannot split a batch');
  const third = await submit();
  assert.equal((await patch([first.id, third.id], 'PREPARING', 'READY')).status, 409);
  assert.equal((await patch([first.id], 'PREPARING', 'READY')).status, 409);
  realtimeTest.failNext = true;
  assert.equal((await patch([first.id, second.id], 'PREPARING', 'READY')).status, 200, 'notification failure does not undo group');
  assert.equal((await Order.findById(third.id).orFail()).status, 'NEW');
  assert.equal((await TableSession.findById(visit._id).orFail()).status, 'ACTIVE');
  const fourth = await submit();
  const cancelled = await staff.request(`/api/dashboard/orders/${fourth.id}`, { method: 'PATCH', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: 'NEW', status: 'CANCELLED' }) }); assert.equal(cancelled.status, 200);
  assert.equal((await patch([third.id, fourth.id])).status, 409);
  assert.equal((await Order.findById(third.id).orFail()).status, 'NEW');
  // Arrivals omitted from a stale but otherwise valid NEW card join at commit.
  const fifth = await submit(); assert.equal((await patch([third.id])).status, 200);
  const laterBatch = await Order.findById(fifth.id).orFail();
  assert.equal(laterBatch.status, 'PREPARING'); assert.notEqual(String(laterBatch.preparationBatchId), String(prepared[0].preparationBatchId));
  assert.equal((await patch([third.id, fifth.id], 'PREPARING', 'READY')).status, 200);
  const billResponse = await staff.request(`/api/dashboard/tables/${table._id}/bill?sessionId=${visit._id}`); assert.equal(billResponse.status, 200);
  const bill = await billResponse.json() as TableSessionBill;
  assert.equal(bill.orders.length, 5); assert.equal(bill.orderCount, 4); assert.equal(bill.finalTotal, first.subtotal * 4); assert.equal(bill.canClose, true);
  const stored = await Order.findById(first.id).lean().orFail();
  assert.deepEqual(stored.items, original.items); assert.equal(stored.idempotencyKey, original.idempotencyKey); assert.equal(stored.createdAt.getTime(), original.createdAt.getTime());
  const customerHistory = await fetch(`${base}/api/r/salt/tables/206/orders`, { headers: { cookie } });
  assert.equal((await customerHistory.json() as { orders: CustomerOrder[] }).orders.length, 5);
  const analyticsResponse = await staff.request('/api/dashboard/analytics?range=today'); assert.equal(analyticsResponse.status, 200);
  const analytics = await analyticsResponse.json() as AnalyticsDto;
  const activity = analytics.tables.find(row => row.id === String(table._id))!;
  assert.equal(activity.orders, 5, 'four batched orders plus the separate old-session fixture remain five orders');
  assert.equal(activity.completedValue, first.subtotal * 4);
  const sixth = await submit(); const seventh = await submit();
  const cancelRace = await Promise.all([
    patch([sixth.id, seventh.id]),
    staff.request(`/api/dashboard/orders/${seventh.id}`, { method: 'PATCH', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: 'NEW', status: 'CANCELLED' }) }),
  ]);
  assert.deepEqual(cancelRace.map(response => response.status).sort(), [200, 409]);
  const sixthState = await Order.findById(sixth.id).orFail(); const seventhState = await Order.findById(seventh.id).orFail();
  assert.deepEqual([sixthState.status, seventhState.status], cancelRace[0].status === 200 ? ['PREPARING', 'PREPARING'] : ['NEW', 'CANCELLED'], 'cancellation race never partially starts a group');
  console.log('PASS: preparation groups tenant/session/table/takeaway boundaries, atomic races, stale membership, post-commit minimal events, split prevention, later arrivals, cancellation, immutable snapshots, individual bill and customer history.');
}
