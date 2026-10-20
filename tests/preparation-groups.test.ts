import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preparationGroups, preparationInput } from '../src/lib/preparation-groups';
import type { LiveOrder } from '../src/types/live-orders';
function order(id: string, patch: Partial<LiveOrder> = {}): LiveOrder {
  return { id, orderNumber: Number(id), status: 'NEW', fulfillmentType: 'TABLE', tableId: 'table', tableSessionId: 'visit', tableNumber: 7, items: [], subtotal: 4800, currency: 'ILS', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), notes: '', ...patch };
}
test('NEW membership is restaurant/session/table scoped; takeaway and history remain individual', () => {
  const orders = [order('1'), order('2'), order('3')];
  assert.equal(preparationGroups(orders.slice(0, 1), 'salt').length, 1);
  assert.equal(preparationGroups(orders, 'salt')[0].orders.length, 3);
  const separated = [order('4', { tableSessionId: 'old' }), order('5', { tableId: 'other' }), order('6', { fulfillmentType: 'TAKEAWAY' }), order('7', { fulfillmentType: 'TAKEAWAY' }), order('8', { status: 'READY' }), order('9', { status: 'READY' })];
  assert.equal(preparationGroups([...orders, ...separated], 'salt').length, 7);
  assert.notEqual(preparationGroups(orders, 'salt')[0].key, preparationGroups(orders, 'other')[0].key);
});
test('stable preparation batches never absorb later NEW or other preparing batches', () => {
  const orders = [order('1', { status: 'PREPARING', preparationBatchId: 'a' }), order('2', { status: 'PREPARING', preparationBatchId: 'a' }), order('3'), order('4', { status: 'PREPARING', preparationBatchId: 'b' }), order('5', { status: 'PREPARING' })];
  assert.deepEqual(preparationGroups(orders, 'salt').map(group => group.orders.map(order => order.id)), [['1', '2'], ['3'], ['4'], ['5']]);
  assert.equal(preparationGroups(orders, 'salt')[3].batchAction, false, 'legacy preparing orders retain single-order controls');
});
test('grouping preserves separate item snapshots, customizations, notes, prices and numbers', () => {
  const item = { productId: 'burger', nameAr: 'Burger', nameHe: 'Burger', nameEn: 'Burger', price: 4800, quantity: 1, itemTotal: 4800, note: 'No mayo', optionGroups: [{ id: 'extras', nameAr: 'Extras', nameHe: 'Extras', nameEn: 'Extras', selected: [{ id: 'cheese', nameAr: 'Cheese', nameHe: 'Cheese', nameEn: 'Cheese', priceDelta: 500 }], removed: [] }] };
  const orders = [order('1', { items: [item] }), order('2', { items: [{ ...item, note: 'Extra toasted', optionGroups: [] }] }), order('3', { items: [item] })];
  const before = structuredClone(orders);
  assert.deepEqual(preparationGroups(orders, 'salt')[0].orders, before);
  assert.deepEqual(orders, before, 'even identical items stay in their original order section');
});
test('batch input rejects ownership overrides, duplicate IDs and invalid transitions', () => {
  const input = { orderIds: ['000000000000000000000001'], expectedStatus: 'NEW', status: 'PREPARING' };
  assert.equal(preparationInput.safeParse(input).success, true);
  for (const patch of [{ restaurantId: 'other' }, { tableSessionId: 'other' }, { orderIds: [] }, { orderIds: [...input.orderIds, ...input.orderIds] }, { orderIds: ['bad'] }, { status: 'READY' }, { expectedStatus: 'ACCEPTED' }]) assert.equal(preparationInput.safeParse({ ...input, ...patch }).success, false);
});
