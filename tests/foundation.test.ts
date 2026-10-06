import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableQuerySchema, slugSchema } from '../src/lib/validators/common';
import { resolveLanguage, direction } from '../src/i18n/config';
import { tableQrUrl } from '../src/lib/qr';
import { Product, User, Order } from '../src/models';
import { Types } from 'mongoose';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

test('QR table parameters must be single positive integers', () => {
  assert.equal(tableQuerySchema.parse('7'), 7);
  for (const value of ['', '0', '-7', '7.5', '7abc', '1e2', '10000', ['7', '8'], undefined]) {
    assert.equal(tableQuerySchema.safeParse(value).success, false);
  }
  assert.equal(slugSchema.safeParse('../salt').success, false);
  assert.equal(tableQrUrl('https://dsmenu.com', 'salt', 7), 'https://dsmenu.com/r/salt?table=7');
});
test('Arabic defaults and all three dictionaries have matching keys', () => {
  assert.equal(resolveLanguage(), 'ar');
  assert.equal(resolveLanguage('unsupported'), 'ar');
  assert.equal(direction('ar'), 'rtl'); assert.equal(direction('he'), 'rtl'); assert.equal(direction('en'), 'ltr');
  const keys = (value: object): string[] => Object.entries(value).flatMap(([key, child]) => typeof child === 'object' ? keys(child).map(nested => `${key}.${nested}`) : [key]).sort();
  assert.deepEqual(keys(ar), keys(en)); assert.deepEqual(keys(he), keys(en));
});
test('models reject fractional money, plaintext passwords and empty orders', async () => {
  const id = new Types.ObjectId();
  const product = new Product({ restaurantId: id, categoryId: id, nameAr: 'أ', nameHe: 'א', nameEn: 'A', price: 12.5 });
  await assert.rejects(product.validate(), /price/);
  const user = new User({ restaurantId: id, name: 'Owner', email: 'owner@example.com', passwordHash: 'plaintext' });
  await assert.rejects(user.validate(), /passwordHash/);
  const order = new Order({ restaurantId: id, tableId: id, tableSessionId: id, orderNumber: 1, idempotencyKey: 'test', items: [], subtotal: 0 });
  await assert.rejects(order.validate(), /items/);
});
