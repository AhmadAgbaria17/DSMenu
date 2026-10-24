import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { kitchenUnit, kitchenUnitKey, kitchenPrintUrl, kitchenPrintInput, kitchenUnitSchema } from '../src/lib/kitchen-print';
import { KitchenPrintState } from '../src/models';

test('kitchen units use stable batch identity; standalone orders use their own identity', () => {
  const id = '000000000000000000000001'; const batch = '000000000000000000000002';
  assert.deepEqual(kitchenUnit({ id, preparationBatchId: batch }), { kind: 'batch', id: batch });
  assert.deepEqual(kitchenUnit({ id }), { kind: 'order', id });
  assert.equal(kitchenUnitKey({ kind: 'batch', id: batch }), `batch:${batch}`);
  assert.equal(kitchenPrintUrl({ kind: 'order', id }), `/print/kitchen/order/${id}`);
});
test('print validation rejects tenant overrides and unbounded/invalid counters', () => {
  const requestId = '00000000-0000-4000-8000-000000000001';
  assert.ok(kitchenPrintInput.safeParse({ requestId, expectedCount: 0 }).success);
  for (const expectedCount of [-1, 1.5, Number.MAX_SAFE_INTEGER, Infinity]) assert.equal(kitchenPrintInput.safeParse({ requestId, expectedCount }).success, false);
  assert.equal(kitchenPrintInput.safeParse({ requestId, expectedCount: 0, restaurantId: 'foreign' }).success, false);
  assert.equal(kitchenPrintInput.safeParse({ expectedCount: 0 }).success, false);
  assert.equal(kitchenUnitSchema.safeParse({ kind: 'table', id: '000000000000000000000001' }).success, false);
  assert.equal(kitchenUnitSchema.safeParse({ kind: 'batch', id: '../foreign' }).success, false);
});
test('print records declare one tenant-scoped unique unit and integer counts', async () => {
  const index = KitchenPrintState.schema.indexes().find(([, options]) => options.name === 'kitchen_print_unit');
  assert.deepEqual(index?.[0], { restaurantId: 1, unitType: 1, unitId: 1 }); assert.equal(index?.[1].unique, true);
  const state = new KitchenPrintState({ kitchenPrintCount: 1.2 });
  await assert.rejects(state.validate(), error => error instanceof mongoose.Error.ValidationError && !!error.errors.kitchenPrintCount);
});
