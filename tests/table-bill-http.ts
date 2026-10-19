import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthClient, type StaffFixture } from './staff-http';
import { createStaffUser } from '../src/lib/staff-users';
import { Table, TableSession, Product, Order, ServiceCall, Restaurant } from '../src/models';
import { optionFixture } from './option-fixture';
import { defaultSelections } from '../src/lib/product-options';
import type { TableSessionBill } from '../src/types/table-bill';
import type { TableSnapshot } from '../src/types/tables';
export async function runBillHttpChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Bill Staff', email: 'bill@salt.local', password: fixture.password, role: 'STAFF' });
  const staff = new AuthClient(base); await staff.login('bill@salt.local', fixture.password);
  const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 205 });
  const foreign = await Restaurant.findOne({ slug: 'other' }).orFail();
  const foreignTable = await Table.findOne({ restaurantId: foreign._id }).orFail();
  const other = new AuthClient(base); await other.login('templates@other.local', fixture.password);
  const customer = (part: string, payload: unknown, cookie = '') => fetch(base + '/api/r/salt/tables/205/' + part, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', cookie }, body: JSON.stringify(payload) });
  const entry = await customer('session', {}); assert.equal(entry.status, 200); const cookie = entry.headers.get('set-cookie')!.split(';')[0];
  const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
  const billPath = '/api/dashboard/tables/' + table._id + '/bill?sessionId=' + visit._id;
  const get = async () => { const response = await staff.request(billPath); assert.equal(response.status, 200); return response.json() as Promise<TableSessionBill>; };
  const close = (body: unknown = { sessionId: String(visit._id) }) => staff.request('/api/dashboard/tables/' + table._id + '/close', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + billPath)).status, 401);
  assert.equal((await other.request(billPath)).status, 404);
  assert.equal((await staff.request('/api/dashboard/tables/' + foreignTable._id + '/bill?sessionId=' + visit._id)).status, 404);
  assert.equal((await staff.request(billPath + '&restaurantId=' + foreign._id)).status, 400);
  const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const saved = { price: product.price, optionGroups: product.optionGroups.toObject() };
  const groups = optionFixture(); const choices = defaultSelections(groups); choices[0].optionIds.splice(1, 1); choices[1].optionIds = [groups[1].options[0].id];
  try {
    await Product.updateOne({ _id: product._id }, { $set: { price: 4800, optionGroups: groups } });
    const submit = async (quantity = 1) => {
      const response = await customer('orders', { clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity, note: 'No mayo', selections: choices }] }, cookie);
      assert.equal(response.status, 200); return (await response.json() as { order: { id: string } }).order.id;
    };
    const first = await submit(2);
    for (const status of ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] as const) {
      await Order.updateOne({ _id: first }, { $set: { status } });
      assert.equal((await get()).canClose, false);
      const blocked = await close(); assert.equal(blocked.status, 409); assert.match(await blocked.text(), /ACTIVE_ORDERS/);
      assert.equal((await TableSession.findById(visit._id).orFail()).status, 'ACTIVE');
    }
    await Order.updateOne({ _id: first }, { $set: { status: 'SERVED', servedAt: new Date(), notes: 'Order note' } });
    const second = await submit(); await Order.updateOne({ _id: second }, { $set: { status: 'SERVED', servedAt: new Date() } });
    const cancelled = await submit(); await Order.updateOne({ _id: cancelled }, { $set: { status: 'CANCELLED', cancelledAt: new Date() } });
    let bill = await get(); assert.equal(bill.orders.length, 3); assert.equal(bill.orderCount, 2); assert.equal(bill.cancelledCount, 1); assert.equal(bill.finalTotal, 15900);
    assert.equal(bill.orders[0].items[0].price, 5300); assert.equal(bill.orders[0].items[0].itemTotal, 10600);
    assert.equal(bill.orders[0].items[0].note, 'No mayo'); assert.equal(bill.orders[0].notes, 'Order note');
    assert.equal(bill.orders[0].items[0].optionGroups![0].removed[0].nameEn, 'Tomato');
    assert.equal(bill.orders[0].items[0].optionGroups![1].selected[0].priceDelta, 500);
    assert.ok(!JSON.stringify(bill).includes('credentials'));
    await Product.updateOne({ _id: product._id }, { $set: { price: 5500, nameEn: 'Changed catalog name' } });
    assert.equal((await get()).finalTotal, 15900); assert.equal((await get()).orders[0].items[0].nameEn, 'Classic Burger');
    assert.equal((await close({ sessionId: String(visit._id), finalTotal: 1 })).status, 400);
    assert.equal((await close({ sessionId: String(visit._id), billRevision: '0'.repeat(64) })).status, 409);
    const callResponse = await customer('service-calls', { type: 'BILL' }, cookie); assert.equal(callResponse.status, 200);
    const call = await ServiceCall.findOne({ tableSessionId: visit._id }).orFail();
    for (const status of ['PENDING', 'ACKNOWLEDGED']) {
      await ServiceCall.updateOne({ _id: call._id }, { $set: { status } });
      assert.equal((await get()).canClose, false); const blocked = await close(); assert.equal(blocked.status, 409); assert.match(await blocked.text(), /UNRESOLVED_CALLS/);
    }
    await ServiceCall.updateOne({ _id: call._id }, { $set: { status: 'RESOLVED', resolvedAt: new Date() } });
    bill = await get(); assert.equal(bill.canClose, true);
    // A new order completed between review and confirmation must still require re-review.
    const later = await submit(); await Order.updateOne({ _id: later }, { $set: { status: 'SERVED', servedAt: new Date() } });
    assert.equal((await close({ sessionId: String(visit._id), billRevision: bill.revision })).status, 409);
    bill = await get();
    const storedBefore = await Order.find({ tableSessionId: visit._id }).sort({ _id: 1 }).lean();
    assert.equal((await close({ sessionId: String(visit._id), billRevision: bill.revision })).status, 200);
    const closed = await TableSession.findById(visit._id).orFail(); assert.equal(closed.status, 'CLOSED'); assert.ok(closed.closedAt);
    assert.deepEqual(await Order.find({ tableSessionId: visit._id }).sort({ _id: 1 }).lean(), storedBefore);
    assert.equal(await ServiceCall.countDocuments({ _id: call._id }), 1);
    const tables = await (await staff.request('/api/dashboard/tables')).json() as TableSnapshot;
    assert.equal(tables.tables.find(row => row.id === String(table._id))!.state, 'AVAILABLE');
    assert.equal((await customer('orders', { clientRequestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, note: '', selections: choices }] }, cookie)).status, 409);
    assert.equal((await customer('service-calls', { type: 'HELP' }, cookie)).status, 409);
    assert.equal((await get()).finalTotal, bill.finalTotal);
    const next = await customer('session', {}); assert.equal(next.status, 200);
    const newVisit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    const fresh = await (await staff.request('/api/dashboard/tables/' + table._id + '/bill?sessionId=' + newVisit._id)).json() as TableSessionBill;
    assert.equal(fresh.orders.length, 0); assert.equal(fresh.finalTotal, 0); assert.equal((await get()).orders.length, 4);
    assert.equal((await other.request('/api/dashboard/tables/' + table._id + '/close', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: String(newVisit._id) }) })).status, 404);
    console.log('PASS: session bill scope/history, cancelled exclusion, snapshot options/notes/agorot, all active statuses and calls block close, stale review conflict, authoritative safe closure and credential rejection.');
  } finally { await Product.updateOne({ _id: product._id }, { $set: { ...saved, nameEn: product.nameEn } }); }
}
