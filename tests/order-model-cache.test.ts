import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';

test('Order refreshes a cached pre-batch schema after hot reload', async () => {
  const legacy = mongoose.model('Order', new mongoose.Schema({ status: String }));
  assert.equal(legacy.schema.path('preparationBatchId'), undefined);
  const { Order } = await import('../src/models/Order');
  assert.ok(Order.schema.path('preparationBatchId'), 'hot reload must not reuse a schema that silently strips batch identity');
  assert.notEqual(Order, legacy);
  assert.equal(Order.collection.name, legacy.collection.name);
  const again = await import('../src/models/Order');
  assert.equal(again.Order, Order);
});
