import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { orderInput } from '../src/lib/validators/orders';
import { newCustomerToken, tokenHash, orderFingerprint, customerCookieName } from '../src/lib/customer-security';
import { cartReducer, parseCart, serializeCart, type CartState } from '../src/lib/cart';
import { parsePending } from '../src/lib/submission';
import type { PublicProduct } from '../src/types/menu';

const productId = '000000000000000000000001';
const input = { clientRequestId: randomUUID(), items: [{ productId, quantity: 2, note: 'No onion' }] };

test('order validation rejects malformed IDs, invalid quantities, oversized notes, empty or duplicate lines', () => {
  assert.ok(orderInput.safeParse(input).success);
  for (const quantity of [0, -1, 1.5, 100, '2', NaN]) assert.equal(orderInput.safeParse({ ...input, items: [{ ...input.items[0], quantity }] }).success, false);
  for (const items of [[], Array(101).fill(input.items[0]), [input.items[0], input.items[0]], [{ ...input.items[0], productId: 'bad' }], [{ ...input.items[0], note: 'x'.repeat(301) }]]) assert.equal(orderInput.safeParse({ ...input, items }).success, false);
  assert.equal(orderInput.safeParse({ ...input, clientRequestId: 'repeat' }).success, false);
});
test('untrusted names, prices, totals, tenant IDs and session IDs never enter validated order data', () => {
  assert.deepEqual(orderInput.parse({ ...input, restaurantId: 'foreign', tableSessionId: 'foreign', subtotal: 1, items: [{ ...input.items[0], price: 1, nameEn: 'Fake', itemTotal: 1 }] }), input);
});
test('opaque credentials have 256 bits of entropy and only a digest is stored', () => {
  const first = newCustomerToken(); const second = newCustomerToken();
  assert.notEqual(first, second); assert.equal(Buffer.from(first, 'base64url').length, 32);
  assert.equal(tokenHash(first)?.length, 64); assert.notEqual(tokenHash(first), first);
  assert.equal(tokenHash('predictable-session-id'), null);
  assert.notEqual(customerCookieName(productId, 7), customerCookieName(productId, 8));
});
test('request fingerprints ignore item ordering and request UUID but bind quantities and notes', () => {
  const items = [...input.items, { productId, quantity: 1, note: 'Other' }];
  assert.equal(orderFingerprint({ ...input, items }), orderFingerprint({ clientRequestId: randomUUID(), items: [...items].reverse() }));
  assert.notEqual(orderFingerprint(input), orderFingerprint({ ...input, items: [{ ...input.items[0], quantity: 3 }] }));
});
test('cart clears submitted quantities only after confirmation, and a replay cannot clear new items', () => {
  const product: PublicProduct = { id: productId, categoryId: productId, nameAr: 'أ', nameHe: 'א', nameEn: 'A', descriptionAr: '', descriptionHe: '', descriptionEn: '', price: 4800, image: null, isAvailable: true, isFeatured: false, sortOrder: 0 };
  const before: CartState = { hydrated: true, items: input.items };
  // Pending/failed requests do not dispatch a cart mutation.
  assert.equal(before.items.length, 1);
  const confirmed = cartReducer(before, { type: 'confirmed', items: input.items, clientRequestId: input.clientRequestId }, [product]);
  assert.equal(confirmed.items.length, 0);
  const newCart = cartReducer(confirmed, { type: 'add', productId, quantity: 1, note: 'No onion' }, [product]);
  assert.equal(cartReducer(newCart, { type: 'confirmed', items: input.items, clientRequestId: input.clientRequestId }, [product]).items[0].quantity, 1);
  const scope = { restaurantId: productId, tableNumber: 7 };
  const persisted = parseCart(serializeCart(newCart.items, scope, newCart.lastConfirmedRequestId), scope, [product]);
  assert.equal(persisted.lastConfirmedRequestId, input.clientRequestId);
  const during = { ...before, items: [{ ...input.items[0], quantity: 3 }, { ...input.items[0], note: 'New note' }] };
  assert.deepEqual(cartReducer(during, { type: 'confirmed', items: input.items, clientRequestId: input.clientRequestId }, [product]).items.map(item => item.quantity), [1, 2]);
});
test('pending submissions survive serialization without credentials and reject corrupt storage', () => {
  const pending = { version: 1, visitId: productId, input };
  assert.deepEqual(parsePending(JSON.stringify(pending)), pending);
  for (const value of [null, '{bad', '{}', 'x'.repeat(100_001)]) assert.equal(parsePending(value), null);
});
