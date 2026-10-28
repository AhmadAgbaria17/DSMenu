import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { priceInput, priceForInput, categoryInput, productFlags, restaurantInput } from '../src/lib/validators/menu-management';
import { validateImage, MAX_IMAGE_BYTES } from '../src/lib/image-validation';
import { Restaurant } from '../src/models';
test('kitchen preference is a boolean with a backward-compatible enabled default', () => {
  const input = { name: 'Salt', description: '', phone: '', whatsapp: '', address: '', googleMapsUrl: '', instagramUrl: '', primaryColor: '#ffffff' };
  assert.equal(new Restaurant({ name: 'Salt', slug: 'salt' }).kitchenPrintingEnabled, true);
  assert.equal(restaurantInput.parse(input).kitchenPrintingEnabled, undefined, 'old clients must not overwrite the stored setting');
  for (const value of [true, false]) assert.equal(restaurantInput.parse({ ...input, kitchenPrintingEnabled: value }).kitchenPrintingEnabled, value);
  for (const value of ['false', 0, null]) assert.equal(restaurantInput.safeParse({ ...input, kitchenPrintingEnabled: value }).success, false);
});
test('decimal price parsing uses integer agorot, boundaries and no floating rounding', () => {
  for (const [input, price] of [['48', 4800], ['19.90', 1990], ['5.50', 550], ['0.01', 1], ['1000000.00', 100000000]] as const) { assert.equal(priceInput.parse(input), price); assert.equal(priceInput.parse(priceForInput(price)), price); }
  for (const invalid of ['-1', '1.001', '1e2', '1,20', 'Infinity', '', '1000000.01', '.50', '0x10']) assert.equal(priceInput.safeParse(invalid).success, false);
});
test('menu validators require three names, bounded sorting, safe URLs and no ownership/image overrides', () => {
  const category = { nameAr: ' A ', nameHe: 'H', nameEn: 'E', sortOrder: 0, isActive: true };
  assert.equal(categoryInput.parse(category).nameAr, 'A');
  for (const patch of [{ nameAr: ' ' }, { nameHe: '' }, { sortOrder: -1 }, { sortOrder: 1.5 }, { restaurantId: 'foreign' }, { image: { url: 'https://evil.test' } }]) assert.equal(categoryInput.safeParse({ ...category, ...patch }).success, false);
  assert.equal(productFlags.safeParse({ price: 42 }).success, false);
  assert.equal(productFlags.safeParse({}).success, false);
  assert.equal(restaurantInput.safeParse({ name: 'Salt', description: '', phone: '', whatsapp: '', address: '', googleMapsUrl: 'javascript:alert(1)', instagramUrl: '', primaryColor: '#ffffff' }).success, false);
});
test('images require bounded decodable still JPEG/PNG/WebP, not spoofed MIME or animated/SVG data', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#254b3e' } }).png().toBuffer();
  assert.equal((await sharp(await validateImage(png, 'image/png')).metadata()).format, 'webp');
  await assert.rejects(validateImage(png, 'image/jpeg'));
  await assert.rejects(validateImage(Buffer.from('<svg></svg>'), 'image/png'));
  await assert.rejects(validateImage(Buffer.from('bad'), 'image/svg+xml'));
  await assert.rejects(validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png'));
  await assert.rejects(validateImage(png.subarray(0, 30), 'image/png'));
});
