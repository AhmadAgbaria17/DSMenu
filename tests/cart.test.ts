import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartLineKey, cartReducer, cartStorageKey, getCartSummary, parseCart, reconcileCart, serializeCart, MAX_NOTE_LENGTH, type CartState } from '../src/lib/cart';
import { localizedName } from '../src/i18n/config';
import { localizedDescription, searchProducts, safeImageUrl } from '../src/lib/menu';
import { formatMoney } from '../src/lib/money';
import type { PublicProduct } from '../src/types/menu';

const product: PublicProduct = {
  id: '000000000000000000000001', categoryId: '000000000000000000000010',
  nameAr: 'برغر', nameHe: 'המבורגר', nameEn: 'Burger',
  descriptionAr: 'مع جبنة', descriptionHe: 'עם גבינה', descriptionEn: 'With Cheddar',
  price: 1990, image: null, isAvailable: true, isFeatured: true, sortOrder: 0,
};
const drink = { ...product, id: '000000000000000000000002', price: 550, nameEn: 'Drink' };
const products = [product, drink];
const scope = { restaurantId: '000000000000000000000100', tableNumber: 7 };
const empty: CartState = { items: [], hydrated: true };
const add = (state = empty, note = '', quantity = 1) => cartReducer(state, { type: 'add', productId: product.id, note, quantity }, products);

test('add merges same product and trimmed note, but preserves different requests', () => {
  const first = add(empty, ' No onion ', 2);
  const merged = add(first, 'No onion', 3);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].quantity, 5);
  const separate = add(merged, 'Extra sauce');
  assert.equal(separate.items.length, 2);
  assert.equal(separate.items[1].note, 'Extra sauce');
  assert.notEqual(cartLineKey(separate.items[0]), cartLineKey(separate.items[1]));
  assert.equal(first.items[0].quantity, 2, 'reducer does not mutate prior state');
});

test('quantity updates clamp safely, cap merges at 99 and remove only the chosen line', () => {
  const state = add(add(empty, 'A', 98), 'A', 2);
  assert.equal(state.items[0].quantity, 99);
  const key = cartLineKey(state.items[0]);
  const changed = cartReducer(state, { type: 'quantity', key, quantity: 3.7 }, products);
  assert.equal(changed.items[0].quantity, 3);
  assert.equal(cartReducer(changed, { type: 'quantity', key, quantity: -3 }, products).items[0].quantity, 1);
  const two = add(changed, 'B');
  assert.deepEqual(cartReducer(two, { type: 'remove', key }, products).items.map(line => line.note), ['B']);
});

test('cart notes can be edited, merge identical lines safely, and reject oversized notes or quantity loss', () => {
  const state = add(add(empty, 'A', 2), 'B', 3);
  const edited = cartReducer(state, { type: 'note', key: cartLineKey(state.items[0]), note: ' B ' }, products);
  assert.deepEqual(edited.items, [{ productId: product.id, note: 'B', quantity: 5 }]);
  assert.equal(cartReducer(state, { type: 'note', key: cartLineKey(state.items[0]), note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }, products), state);
  const full = add(add(empty, 'A', 99), 'B', 1);
  assert.equal(cartReducer(full, { type: 'note', key: cartLineKey(full.items[0]), note: 'B' }, products), full);
});

test('reject unavailable or foreign products, invalid additions, and additions before hydration', () => {
  assert.equal(cartReducer(empty, { type: 'add', productId: '000000000000000000000999', quantity: 1, note: '' }, products).items.length, 0);
  assert.equal(cartReducer(empty, { type: 'add', productId: product.id, quantity: 1, note: '' }, [{ ...product, isAvailable: false }]).items.length, 0);
  for (const quantity of [0, -1, 2.5, 100, Infinity, NaN]) assert.equal(add(empty, '', quantity).items.length, 0);
  assert.equal(add(empty, 'x'.repeat(MAX_NOTE_LENGTH + 1)).items.length, 0);
  assert.equal(add({ ...empty, hydrated: false }).items.length, 0);
});

test('totals use current authoritative integer prices, never persisted prices', () => {
  const state = add(empty, '', 3);
  const items = [...state.items, { productId: drink.id, quantity: 1, note: '' }];
  assert.equal(getCartSummary(items, products).subtotal, 6520);
  assert.equal(getCartSummary(items, products).count, 4);
  assert.equal(getCartSummary(items, [{ ...product, price: 2100 }, drink]).subtotal, 6850);
  assert.match(formatMoney(4800, 'en', 'ILS'), /48\.00/);
  assert.match(formatMoney(1990, 'en', 'ILS'), /19\.90/);
  assert.match(formatMoney(550, 'en', 'ILS'), /5\.50/);
  assert.throws(() => formatMoney(19.9, 'en'));
});

test('versioned persistence round-trips and isolates restaurant and table', () => {
  const state = add(empty, 'No onion', 2);
  const raw = serializeCart(state.items, scope);
  assert.deepEqual(parseCart(raw, scope, products), { items: state.items, recovered: false });
  assert.doesNotMatch(raw, /price|subtotal|nameEn|image/);
  const otherTable = { ...scope, tableNumber: 8 };
  const otherRestaurant = { ...scope, restaurantId: '000000000000000000000101' };
  for (const other of [otherTable, otherRestaurant]) {
    assert.notEqual(cartStorageKey(scope), cartStorageKey(other));
    assert.equal(parseCart(raw, other, products).items.length, 0);
  }
});

test('malformed, oversized, unexpected versions and hostile storage recover without throwing', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', 'x'.repeat(200_001), JSON.stringify({ version: 2, ...scope, items: [] })]) {
    assert.deepEqual(parseCart(raw, scope, products), { items: [], recovered: true });
  }
  assert.deepEqual(parseCart(null, scope, products), { items: [], recovered: false });
  const raw = JSON.stringify({ version: 1, ...scope, items: [null, { productId: product.id, note: '', quantity: '99' }, { productId: product.id, note: '', quantity: 2, price: 1 }] });
  const parsed = parseCart(raw, scope, products);
  assert.equal(parsed.items.length, 1);
  assert.equal(getCartSummary(parsed.items, products).subtotal, 3980);
});

test('reconciliation removes stale/unavailable products, trims notes and clamps quantities', () => {
  const items = [
    { productId: product.id, quantity: 120.8, note: '  hello  ' },
    { productId: drink.id, quantity: 1, note: '' },
    { productId: '000000000000000000000999', quantity: 2, note: '' },
  ];
  assert.deepEqual(reconcileCart(items, [{ ...product }, { ...drink, isAvailable: false }]), [{ productId: product.id, quantity: 99, note: 'hello' }]);
  assert.equal(reconcileCart([{ productId: product.id, quantity: -5, note: 'x'.repeat(400) }], products)[0].note.length, 300);
});

test('localized names, descriptions and search follow the selected language', () => {
  assert.equal(localizedName(product, 'ar'), 'برغر');
  assert.equal(localizedName(product, 'he'), 'המבורגר');
  assert.equal(localizedName(product, 'en'), 'Burger');
  assert.equal(localizedDescription(product, 'he'), 'עם גבינה');
  assert.equal(searchProducts([product], '  CHEDDAR  ', 'en').length, 1);
  assert.equal(searchProducts([product], 'جبنة', 'ar').length, 1);
  assert.equal(searchProducts([product], 'גבינה', 'he').length, 1);
  assert.equal(searchProducts([product], 'Burger', 'ar').length, 0);
  assert.equal(searchProducts([product], 'missing', 'en').length, 0);
  assert.equal(searchProducts([product], '   ', 'en').length, 1);
});

test('image URLs reject executable and protocol-relative values', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,test', '//example.com/x', '/\\example.com/x', 'broken']) assert.equal(safeImageUrl(input), null);
  assert.equal(safeImageUrl('/menu/burger.jpg'), '/menu/burger.jpg');
  assert.equal(safeImageUrl('https://example.com/burger.jpg'), 'https://example.com/burger.jpg');
});
