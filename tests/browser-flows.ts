import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { mockRealtime } from './realtime-transport';
import { cartStorageKey, serializeCart } from '../src/lib/cart';
import { checkProductImageFraming } from './product-image-browser';
import { checkHorizontalMenu } from './horizontal-menu';

export async function runBrowserChecks(base: string, restaurantId: string, productId: string, unavailableId: string,
  changeProduct: (patch: { price?: number; isAvailable?: boolean; image?: { url: string; publicId: string } | null }) => Promise<void>) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await mockRealtime(context);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) errors.push(message.text()); });
  const scope = { restaurantId, tableNumber: 7 };
  const storageKey = cartStorageKey(scope);
  const artifacts = 'test-artifacts';
  await mkdir(artifacts, { recursive: true });
  try {
    await page.goto(`${base}/r/salt?table=7`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('my-order-button')).toBeEnabled();
    const arabicCatalog = await checkHorizontalMenu(page, 'rtl');
    await page.screenshot({ path: `${artifacts}/menu-ar-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    assert.deepEqual(await checkHorizontalMenu(page, 'ltr'), arabicCatalog, 'locale switches preserve category/product ordering');
    const categorySections = page.locator('section[id^="category-"]');
    assert.deepEqual(await categorySections.locator('h3').allTextContents(), ['Burgers', 'Pizza', 'Drinks', 'Desserts']);
    assert.deepEqual(await categorySections.first().locator('h4').allTextContents(), ['Classic Burger', 'Cheeseburger']);
    await page.getByRole('link', { name: 'Burgers', exact: true }).click();
    await expect(page).toHaveURL(/#category-/);
    await expect(categorySections.first()).toBeInViewport();
    await expect(page.getByTestId('detected-table')).toContainText('Table 7');
    await expect(page.getByRole('heading', { name: 'A few house favorites' })).toBeVisible();

    const search = page.getByRole('searchbox');
    await search.fill('  CHEDDAR  ');
    await expect(page.getByRole('heading', { name: 'Cheeseburger', exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Classic Burger', exact: true })).toHaveCount(0);
    await search.fill('no such dish');
    await expect(page.getByText('No dishes found. Try another search.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Add Cheesecake', exact: true })).toBeDisabled();

    const openBurger = page.getByRole('button', { name: 'Add Classic Burger', exact: true }).first();
    await openBurger.click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName('Classic Burger');
    await dialog.getByRole('button', { name: 'Increase Classic Burger quantity' }).click();
    await dialog.getByRole('textbox', { name: 'Order notes (optional)' }).fill('No onion');
    await page.screenshot({ path: `${artifacts}/product-en-mobile.png` });
    await dialog.getByRole('button', { name: /Add to My Order/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(openBurger).toBeFocused();
    await expect(page.getByTestId('my-order-button')).toContainText('2 items');
    await expect(page.getByTestId('my-order-button')).toContainText('96.00');

    // The featured card and regular category card share the same product identity.
    await page.getByRole('button', { name: 'Add Classic Burger', exact: true }).last().click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('No onion');
    await dialog.getByRole('button', { name: /Add to My Order/ }).click();
    await openBurger.click();
    await page.getByRole('dialog').getByRole('textbox').fill('Extra sauce');
    await page.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await page.getByTestId('my-order-button').click();
    dialog = page.getByRole('dialog');
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await expect(page.getByTestId('cart-subtotal')).toContainText('192.00');
    await dialog.getByRole('button', { name: 'Decrease Classic Burger quantity' }).first().click();
    await expect(page.getByTestId('cart-subtotal')).toContainText('144.00');
    await page.screenshot({ path: `${artifacts}/cart-en-mobile.png` });
    // Native modal focus containment and Escape restore the launch button.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'focus remains in the dialog');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('my-order-button')).toBeFocused();

    await page.reload();
    await expect(page.getByTestId('my-order-button')).toContainText('3 items');
    await expect(page.getByTestId('my-order-button')).toContainText('144.00');
    await page.getByRole('button', { name: 'עברית', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    assert.deepEqual(await checkHorizontalMenu(page, 'rtl'), arabicCatalog, 'Hebrew preserves catalog ordering');
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('cart-line').first()).toContainText('המבורגר קלאסי');
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await page.screenshot({ path: `${artifacts}/cart-he-mobile.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('cart-line').first()).toContainText('برغر كلاسيك');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto(`${base}/r/salt?table=8`);
    await expect(page.getByTestId('my-order-button')).toBeEnabled();
    await expect(page.getByTestId('my-order-button')).toContainText('0 items');
    await page.goto(`${base}/r/other?table=99`);
    await expect(page.getByTestId('my-order-button')).toBeEnabled();
    await expect(page.getByTestId('my-order-button')).toContainText('0 items');
    await page.goto(`${base}/r/salt?table=7`);
    await expect(page.getByTestId('my-order-button')).toContainText('3 items');
    await page.getByTestId('my-order-button').click();
    await page.getByRole('button', { name: 'Remove Classic Burger' }).last().click();
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-subtotal')).toContainText('96.00');
    await page.getByRole('button', { name: 'Remove Classic Burger' }).click();
    await expect(page.getByText('Your order is empty', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto(`${base}/r/salt?table=99`);
    await expect(page.getByRole('alert').filter({ hasText: 'This table link is invalid' })).toBeVisible();
    await expect(page.getByTestId('my-order-button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Classic Burger', exact: true }).first()).toBeDisabled();
    await page.goto(`${base}/r/salt`);
    await page.getByRole('link', { name: 'Table 7', exact: true }).click();
    await expect(page.getByTestId('detected-table')).toContainText('Table 7');

    // The table label is server rendered; wait for cart hydration before replacing storage.
    await expect(page.getByTestId('my-order-button')).toBeEnabled();
    await page.evaluate(key => localStorage.setItem(key, '{not-json'), storageKey);
    await page.reload();
    await expect(page.getByText('Your saved selection was updated', { exact: false })).toBeVisible();
    await expect(page.getByTestId('my-order-button')).toContainText('0 items');
    const stale = JSON.stringify({ version: 1, ...scope, items: [
      { productId, quantity: 120, note: '', price: 1, nameEn: 'Tampered name' },
      { productId: unavailableId, quantity: 1, note: '' },
      { productId: '000000000000000000000999', quantity: 1, note: '' },
    ] });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: stale });
    await page.reload();
    await expect(page.getByTestId('my-order-button')).toContainText('99 items');
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line')).toContainText('Classic Burger');
    await expect(page.getByTestId('cart-subtotal')).toContainText('4,752.00');
    await page.keyboard.press('Escape');

    // Genuine server catalog changes can be reconciled without trusting stored snapshots.
    const saved = serializeCart([{ productId, quantity: 1, note: '' }], scope);
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: saved });
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${artifacts}/menu-en-desktop.png`, fullPage: true });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal overflow at ${width}px`);
    }

    // Blocked storage should preserve an in-memory cart without crashing.
    const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); };
    });
    const blockedPage = await blocked.newPage();
    await mockRealtime(blocked);
    await blockedPage.goto(`${base}/r/salt?table=7`);
    await blockedPage.getByRole('button', { name: 'English', exact: true }).click();
    await expect(blockedPage.getByText('Your browser cannot save this order.', { exact: false })).toBeVisible();
    await blockedPage.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    await blockedPage.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await expect(blockedPage.getByTestId('my-order-button')).toContainText('1 item');
    await blockedPage.getByRole('button', { name: 'עברית', exact: true }).click();
    await expect(blockedPage.getByTestId('my-order-button')).toContainText('48.00');
    await blockedPage.getByTestId('my-order-button').click();
    await expect(blockedPage.getByTestId('cart-line')).toHaveCount(1);
    await blocked.close();

    // Refresh gets current prices; a locale server rerender can remove a now-unavailable
    // item without remounting the provider. Re-enabling it must not resurrect the line.
    await changeProduct({ price: 5200 });
    await page.reload();
    await expect(page.getByTestId('my-order-button')).toContainText('52.00');
    await changeProduct({ isAvailable: false });
    await page.getByRole('button', { name: 'עברית', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByTestId('my-order-button')).toContainText('0.00');
    await changeProduct({ isAvailable: true, price: 4800 });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('my-order-button')).toContainText('0 items');

    // Exercise actual database image URLs and failure fallback without external requests.
    await page.route('https://menu-images.example.test/good.svg', route => route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#254b3e"/></svg>',
    }));
    await changeProduct({ image: { url: 'https://menu-images.example.test/good.svg', publicId: 'private-image-identifier' } });
    await page.reload();
    const productImage = page.getByRole('img', { name: 'Classic Burger', exact: true }).first();
    await productImage.scrollIntoViewIfNeeded();
    await expect.poll(() => productImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    assert.doesNotMatch(await page.content(), /private-image-identifier/);
    await page.route('https://menu-images.example.test/broken.png', route => route.abort());
    await changeProduct({ image: { url: 'https://menu-images.example.test/broken.png', publicId: 'private-image-identifier' } });
    await page.reload();
    await page.getByRole('button', { name: 'View Classic Burger', exact: true }).first().scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'View Classic Burger', exact: true }).first().locator('img')).toHaveCount(0);
    await checkProductImageFraming(page, base, productId, changeProduct);
    await changeProduct({ image: null });
    assert.deepEqual(errors, [], 'no browser exceptions or hydration errors');
    console.log('PASS: mobile browser cart, notes, persistence, language switching, tenant/table scope, invalid storage, keyboard dialogs, blocked storage and responsive layouts.');
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); await browser.close(); }
}
