import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveBasePrice } from '../src/lib/product-price';
import { productInput, discountPriceInput } from '../src/lib/validators/menu-management';
import { getCartSummary } from '../src/lib/cart';
import { defaultSelections } from '../src/lib/product-options';
import { optionFixture } from './option-fixture';
import type { PublicProduct } from '../src/types/menu';
import { Product } from '../src/models/Product';
import { Types } from 'mongoose';

test('product documents reject invalid discounts and regular-price edits below an existing discount', async () => {
  const input = { restaurantId: new Types.ObjectId(), categoryId: new Types.ObjectId(), nameAr: 'Burger', nameHe: 'Burger', nameEn: 'Burger', price: 4800 };
  for (const discountPrice of [-1, 1.5, 4800, 4900]) await assert.rejects(new Product({ ...input, discountPrice }).validate());
  for (const discountPrice of [undefined, null, 0, 3900]) await new Product({ ...input, discountPrice }).validate();
  const product = new Product({ ...input, discountPrice: 3900 }); product.price = 3000;
  await assert.rejects(product.validate());
});

test('discounts use integer agorot, accept zero and fall back safely for legacy/invalid values', () => {
  for (const discountPrice of [undefined, null, -1, 4800, 4900, 1.5, NaN]) assert.equal(effectiveBasePrice({ price: 4800, discountPrice }), 4800);
  assert.equal(effectiveBasePrice({ price: 4800, discountPrice: 3900 }), 3900);
  assert.equal(effectiveBasePrice({ price: 4800, discountPrice: 0 }), 0);
  assert.equal(discountPriceInput.parse(''), null);
  assert.equal(discountPriceInput.parse('19.90'), 1990);
  const input = { categoryId: '000000000000000000000001', nameAr: 'Burger', nameHe: 'Burger', nameEn: 'Burger', descriptionAr: '', descriptionHe: '', descriptionEn: '', price: '48', sortOrder: 0, isAvailable: true, isFeatured: false, isArchived: false };
  for (const discountPrice of ['48', '49', '-1', '1.001', 'abc']) assert.equal(productInput.safeParse({ ...input, discountPrice }).success, false);
  for (const discountPrice of [undefined, null, '', '0', '39']) assert.equal(productInput.safeParse({ ...input, discountPrice }).success, true);
});

test('cart applies discount before extras and quantity and reprices from the current catalog', () => {
  const groups = optionFixture(); const selections = defaultSelections(groups);
  selections[1].optionIds = [groups[1].options[0].id];
  const product: PublicProduct = { id: '000000000000000000000001', categoryId: '000000000000000000000002', nameAr: 'Burger', nameHe: 'Burger', nameEn: 'Burger', descriptionAr: '', descriptionHe: '', descriptionEn: '', price: 4800, discountPrice: 3900, optionGroups: groups, image: null, isAvailable: true, isFeatured: false, sortOrder: 0 };
  const items = [{ productId: product.id, quantity: 2, note: '', selections }];
  assert.equal(getCartSummary(items, [product]).subtotal, 8800);
  assert.equal(getCartSummary(items, [{ ...product, discountPrice: null }]).subtotal, 10600);
  assert.equal(getCartSummary(items, [{ ...product, discountPrice: 0 }]).subtotal, 1000);
});
