import { Order } from '@/models';
// Build scoped replacements BEFORE dropping the two legacy, table-only constraints.
// No documents or unrelated indexes are removed. Safe to rerun after interruption.
export async function migrateOrderIndexes() {
  await Order.createIndexes();
  const indexes = await Order.collection.indexes();
  for (const legacy of ['tableSessionId_1_orderNumber_1', 'restaurantId_1_tableSessionId_1_idempotencyKey_1']) {
    const index = indexes.find(i => i.name === legacy);
    if (index && index.unique && !index.partialFilterExpression) await Order.collection.dropIndex(legacy);
  }
}
export async function requireTakeawayIndexes() {
  const indexes = await Order.collection.indexes();
  if (indexes.some(i => ['tableSessionId_1_orderNumber_1', 'restaurantId_1_tableSessionId_1_idempotencyKey_1'].includes(i.name ?? '') && !i.partialFilterExpression) || !['takeaway_order_number', 'takeaway_idempotency'].every(name => indexes.some(i => i.name === name && i.unique))) throw new Error('Apply order indexes before takeaway ordering.');
}
