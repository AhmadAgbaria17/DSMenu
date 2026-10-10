import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { optionFixture } from './option-fixture';
import { defaultSelections, resolveOptions, optionGroupsSchema, canonicalSelections } from '../src/lib/product-options';
import { cartLineKey, cartReducer, getCartSummary, parseCart, serializeCart } from '../src/lib/cart';
import { orderInput } from '../src/lib/validators/orders';
import { orderFingerprint } from '../src/lib/customer-security';
import { Product } from '../src/models';
import type { PublicProduct } from '../src/types/menu';
const productId = '000000000000000000000001';
const scope = { restaurantId: '000000000000000000000002', tableNumber: 7 };

test('included defaults/removals, free single choices and paid extras use integer prices', () => {
  const groups = optionFixture(); assert.deepEqual(resolveOptions(), { optionGroups: [], optionsTotal: 0 });
  const selections = defaultSelections(groups); assert.equal(selections[0].optionIds.length, 4);
  selections[0].optionIds.splice(1, 1); selections[1].optionIds = [groups[1].options[0].id, groups[1].options[2].id];
  const result = resolveOptions(groups, selections); assert.equal(result.optionsTotal, 2000); assert.equal(result.optionGroups[0].removed[0].nameEn, 'Tomato'); assert.equal((4800 + result.optionsTotal) * 2, 13600);
});
test('required/min/max, single, duplicate, unknown, inactive and foreign choices are rejected', () => {
  const groups = optionFixture(); const defaults = defaultSelections(groups);
  for (const mutate of [(s: typeof defaults) => { s[2].optionIds = []; }, (s: typeof defaults) => { s[2].optionIds.push(groups[2].options[1].id); }, (s: typeof defaults) => { s[1].optionIds = groups[1].options.map(o => o.id); }, (s: typeof defaults) => { s[0].optionIds.push(s[0].optionIds[0]); }, (s: typeof defaults) => { s[1].optionIds = [randomUUID()]; }, (s: typeof defaults) => { s[1].optionIds = [groups[0].options[0].id]; }, (s: typeof defaults) => { s.push(s[0]); }, (s: typeof defaults) => { s[0].groupId = randomUUID(); }]) {
    const choices = structuredClone(defaults); mutate(choices); assert.throws(() => resolveOptions(groups, choices));
  }
  assert.throws(() => resolveOptions(groups));
  groups[1].minSelections = 1; assert.throws(() => resolveOptions(groups, defaults)); groups[1].minSelections = 0;
  groups[0].options[0].isActive = false; assert.throws(() => resolveOptions(groups, defaults)); groups[0].options[0].isActive = true;
  groups[0].isActive = false; assert.throws(() => resolveOptions(groups, defaults));
});
test('configuration validates UUID identity, bounds, included prices and consistent defaults in Zod and Mongoose', () => {
  const groups = optionFixture(); assert.ok(optionGroupsSchema.safeParse(groups).success);
  const product = new Product({ restaurantId: scope.restaurantId, categoryId: productId, nameAr: 'a', nameHe: 'h', nameEn: 'e', price: 4800, optionGroups: groups }); assert.equal(product.validateSync(), undefined);
  for (const mutate of [(g: typeof groups) => { g[0].options[0].priceDelta = 1; }, (g: typeof groups) => { g[2].maxSelections = 2; }, (g: typeof groups) => { g[1].options[0].priceDelta = 0.5; }, (g: typeof groups) => { g[1].minSelections = 3; }, (g: typeof groups) => { g[2].options[1].isDefault = true; }, (g: typeof groups) => { g[0].id = g[1].id; }]) { const invalid = structuredClone(groups); mutate(invalid); assert.equal(optionGroupsSchema.safeParse(invalid).success, false); }
});
test('customization identity, merge, persistence, old carts and stale review preserve choices', () => {
  const groups = optionFixture(); const product: PublicProduct = { id: productId, categoryId: productId, nameAr: 'a', nameHe: 'h', nameEn: 'e', descriptionAr: '', descriptionHe: '', descriptionEn: '', image: null, price: 4800, isAvailable: true, isFeatured: false, sortOrder: 0, optionGroups: groups };
  const selections = defaultSelections(groups); selections[1].optionIds = [groups[1].options[0].id];
  const item = { productId, quantity: 2, note: '', selections };
  const state = cartReducer({ hydrated: true, items: [item] }, { type: 'add', ...item, selections: canonicalSelections(selections).reverse() }, [product]); assert.equal(state.items.length, 1); assert.equal(state.items[0].quantity, 4);
  const different = { ...item, selections: defaultSelections(groups) }; assert.notEqual(cartLineKey(item), cartLineKey(different)); assert.equal(cartReducer(state, { type: 'add', ...different }, [product]).items.length, 2);
  assert.equal(getCartSummary([item], [product]).subtotal, 10600);
  assert.deepEqual(parseCart(serializeCart([item], scope), scope, [product]).items[0].selections, canonicalSelections(selections));
  assert.equal(getCartSummary([{ productId, quantity: 1, note: '' }], [product]).lines[0].needsReview, true);
  groups[1].options[0].isActive = false; const stale = parseCart(serializeCart([item], scope), scope, [product]).items; assert.equal(stale.length, 1); assert.equal(getCartSummary(stale, [product]).lines[0].needsReview, true);
  assert.equal(getCartSummary([{ productId, quantity: 1, note: '' }], [{ ...product, optionGroups: [] }]).subtotal, 4800);
});
test('order parsing strips forged option prices and fingerprint binds canonical choices', () => {
  const groups = optionFixture(); const selections = defaultSelections(groups); const input = { clientRequestId: randomUUID(), items: [{ productId, quantity: 1, note: '', selections }] };
  const parsed = orderInput.parse({ ...input, items: [{ ...input.items[0], price: 1, selections: selections.map(s => ({ ...s, priceDelta: -500 })) }] }); assert.equal(JSON.stringify(parsed).includes('priceDelta'), false);
  assert.equal(orderFingerprint(parsed), orderFingerprint({ ...parsed, items: [{ ...parsed.items[0], selections: canonicalSelections(selections).reverse() }] }));
  const changed = structuredClone(parsed); changed.items[0].selections![1].optionIds = [groups[1].options[0].id]; assert.notEqual(orderFingerprint(parsed), orderFingerprint(changed));
});
