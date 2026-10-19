import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBill } from '../src/lib/table-bill';
import { closeTableInput } from '../src/lib/validators/tables';
import type { BillOrder } from '../src/types/table-bill';
const order = (subtotal: number, status: BillOrder['status']): BillOrder => ({ id: 'order', orderNumber: 1, status, subtotal, currency: 'ILS', createdAt: new Date(0).toISOString(), notes: '', items: [] });
test('session bills sum stored non-cancelled subtotals in integer agorot, including running orders', () => {
  const result = summarizeBill([order(4800, 'NEW'), order(1990, 'ACCEPTED'), order(550, 'PREPARING'), order(10600, 'READY'), order(1200, 'SERVED'), order(99999, 'CANCELLED')]);
  assert.deepEqual(result, { finalTotal: 19140, currency: 'ILS', orderCount: 5, cancelledCount: 1, activeOrders: 4 });
  assert.equal(summarizeBill([]).finalTotal, 0);
  assert.equal(summarizeBill([order(100, 'CANCELLED')]).orderCount, 0);
});
test('bill rejects invalid stored money and close input rejects authoritative client totals', () => {
  for (const amount of [NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => summarizeBill([order(amount, 'SERVED')]));
  assert.throws(() => summarizeBill([order(Number.MAX_SAFE_INTEGER, 'SERVED'), order(1, 'SERVED')]));
  assert.throws(() => summarizeBill([order(10, 'SERVED'), { ...order(10, 'SERVED'), currency: 'USD' }]));
  assert.equal(closeTableInput.safeParse({ sessionId: '123456789012345678901234', finalTotal: 1 }).success, false);
  assert.equal(closeTableInput.safeParse({ sessionId: '123456789012345678901234', billRevision: 'a'.repeat(64) }).success, true);
});
