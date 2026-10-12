import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { takeawayIdentity } from '../src/lib/validators/takeaway';
import { takeawayQrUrl, tableQrUrl } from '../src/lib/qr';
import { cartStorageKey, parseCart, serializeCart } from '../src/lib/cart';
import { groupManagedProducts } from '../src/lib/managed-product-groups';
import { allowTakeawayEntry } from '../src/lib/takeaway-throttle';
import { Order } from '../src/models';
import type { ManagedProduct } from '../src/types/menu-management';
test('takeaway identity normalizes practical local/international numbers and rejects missing/invalid input', () => {
  assert.deepEqual(takeawayIdentity.parse({ customerName: ' Ahmad ', customerPhone: ' +972 (50) 123-4567 ' }), { customerName: 'Ahmad', customerPhone: '+972501234567' });
  assert.equal(takeawayIdentity.parse({ customerName: 'Ahmad', customerPhone: '0501234567' }).customerPhone, '0501234567');
  for (const patch of [{ customerName: '' }, { customerName: 'a'.repeat(101) }, { customerPhone: '' }, { customerPhone: '123' }, { customerPhone: '123abc1234' }, { customerPhone: '123+4567890' }, { customerPhone: '0'.repeat(16) }, { restaurantId: 'fake' }]) assert.equal(takeawayIdentity.safeParse({ customerName: 'Ahmad', customerPhone: '0501234567', ...patch }).success, false);
});
test('QR and cart scopes distinguish table and every takeaway visit', () => {
  assert.equal(takeawayQrUrl('https://dsmenu.com', 'salt'), 'https://dsmenu.com/r/salt?mode=takeaway');
  assert.equal(tableQrUrl('https://dsmenu.com', 'salt', 7), 'https://dsmenu.com/r/salt?table=7');
  const restaurantId = String(new Types.ObjectId()); const table = { restaurantId, tableNumber: 7 }; const takeaway = { restaurantId, takeawayVisitId: String(new Types.ObjectId()) };
  assert.notEqual(cartStorageKey(table), cartStorageKey(takeaway));
  assert.equal(parseCart(serializeCart([], table), takeaway, []).recovered, true);
  assert.equal(parseCart(serializeCart([], takeaway), table, []).recovered, true);
  assert.equal(parseCart(serializeCart([], takeaway), takeaway, []).recovered, false);
  assert.equal(parseCart(serializeCart([], takeaway), { ...takeaway, takeawayVisitId: String(new Types.ObjectId()) }, []).recovered, true);
});
test('product grouping preserves category-local ordering, search and malformed category fallback', () => {
  const names = { nameAr: 'X', nameHe: 'X', nameEn: 'X' };
  const categories = [{ ...names, id: 'b', sortOrder: 2, isActive: true, image: null }, { ...names, id: 'a', sortOrder: 1, isActive: true, image: null }];
  const product = (id: string, categoryId: string, sortOrder: number): ManagedProduct => ({ ...names, id, categoryId, sortOrder, descriptionAr: '', descriptionHe: '', descriptionEn: '', price: 100, isAvailable: true, isArchived: false, isFeatured: false, image: null });
  const products = [product('2', 'a', 2), product('1', 'a', 1), product('3', 'b', 0), product('4', 'missing', 0)];
  const groups = groupManagedProducts(categories, products, '', 'en');
  assert.deepEqual(groups.map(g => g.id), ['a', 'b', 'uncategorized']); assert.deepEqual(groups[0].products.map(p => p.id), ['1', '2']);
  assert.equal(groupManagedProducts(categories, products, 'absent', 'en').length, 0);
});
test('takeaway cannot masquerade as a table and entry throttle expires', async () => {
  const id = new Types.ObjectId();
  const order = { restaurantId: id, orderNumber: 1, idempotencyKey: 'test', subtotal: 100, items: [{ productId: id, nameAr: 'x', nameHe: 'x', nameEn: 'x', price: 100, quantity: 1, itemTotal: 100 }] };
  await new Order({ ...order, tableId: id, tableSessionId: id }).validate();
  await new Order({ ...order, fulfillmentType: 'TAKEAWAY', takeawaySessionId: id, customerName: 'Ahmad', customerPhone: '0501234567' }).validate();
  await assert.rejects(new Order({ ...order, fulfillmentType: 'TAKEAWAY', tableId: id, takeawaySessionId: id, customerName: 'Ahmad', customerPhone: '0501234567' }).validate());
  await assert.rejects(new Order({ ...order, fulfillmentType: 'TABLE', takeawaySessionId: id }).validate());
  for (let i = 0; i < 30; i++) assert.equal(allowTakeawayEntry('test-ip', 0), true);
  assert.equal(allowTakeawayEntry('test-ip', 0), false); assert.equal(allowTakeawayEntry('test-ip', 60001), true);
});
