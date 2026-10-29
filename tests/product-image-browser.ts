import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, type Page } from '@playwright/test';

export async function checkProductImageFraming(page: Page, base: string, productId: string, changeProduct: (patch: { image: { url: string; publicId: string } }) => Promise<void>) {
  const variants: { name: string; body: Buffer }[] = [];
  for (const [name, width, height] of [['portrait', 240, 480], ['square', 400, 400], ['landscape', 640, 240]] as const) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect width="100%" height="100%" fill="#eeeade"/><rect x="4" y="4" width="' + (width - 8) + '" height="' + (height - 8) + '" fill="#43735c" stroke="#e29035" stroke-width="8"/><circle cx="' + width / 2 + '" cy="' + height / 2 + '" r="60" fill="#ffdb82"/></svg>';
    variants.push({ name, body: await sharp(Buffer.from(svg)).png().toBuffer() });
  }
  const existing = await readFile('test-artifacts/existing-burger-image').catch(() => null);
  if (existing) variants.push({ name: 'existing-burger', body: await sharp(existing).png().toBuffer() });
  for (const variant of variants) {
    const url = 'https://menu-images.example.test/framing-' + variant.name + '.png';
    await page.route(url, route => route.fulfill({ contentType: 'image/png', body: variant.body }));
    await changeProduct({ image: { url, publicId: 'test-framing' } });
    for (const locale of ['ar', 'he', 'en']) {
      await page.context().addCookies([{ name: 'dsmenu-language', value: locale, url: base }]);
      await page.goto(base + '/r/salt?table=7'); await enterTableFixture(page);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      for (const width of [390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const card = page.locator('[data-product-id="' + productId + '"]').first();
        const image = card.locator('img').first();
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await expect(image).toHaveCSS('object-fit', 'contain');
        const box = await image.boundingBox(); assert.ok(box); assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.02, 'card frame dimensions stay unchanged');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (variant.name === 'existing-burger' && locale === 'en' && width === 390) {
          await card.screenshot({ path: 'test-artifacts/burger-card-after.png' });
          await image.evaluate(node => { node.style.objectFit = 'cover'; });
          await card.screenshot({ path: 'test-artifacts/burger-card-before.png' });
          await image.evaluate(node => { node.style.removeProperty('object-fit'); });
        }
        await card.getByRole('button').first().click();
        const dialog = page.getByRole('dialog'); const detail = dialog.locator('img').first();
        await expect(detail).toHaveCSS('object-fit', 'contain');
        await expect.poll(() => detail.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const detailBox = await detail.boundingBox(); assert.ok(detailBox); assert.ok(Math.abs(detailBox.width / detailBox.height - 2) < 0.02);
        assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        if (variant.name === 'existing-burger' && locale === 'en' && width === 390) await page.screenshot({ path: 'test-artifacts/burger-details-after.png' });
        await page.keyboard.press('Escape');
      }
    }
  }
  console.log('PASS: product card/details contain framing, original aspect preservation, unchanged container dimensions, AR/HE/EN, mobile/tablet/desktop and no overflow across ' + variants.map(v => v.name).join(', ') + '.');
}
