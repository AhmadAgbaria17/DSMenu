import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Category, Product, Order, TakeawaySession } from '../src/models';
import { optionFixture } from './option-fixture';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
export async function runTakeawayBrowserChecks(base: string, fixture: StaffFixture) {
  const browser = await chromium.launch(); const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } }); const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  await staff.addInitScript(() => { let count = 0; const start = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...args) { document.documentElement.dataset.takeawaySounds = String(++count); return start.apply(this, args); }; });
  const dashboard = await staff.newPage(); const menu = await customer.newPage(); const errors: string[] = []; dashboard.on('pageerror', e => errors.push(e.message)); menu.on('pageerror', e => errors.push(e.message));
  const burger = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail(); const previous = { price: burger.price, optionGroups: burger.optionGroups.toObject() };
  await Product.updateOne({ _id: burger._id }, { $set: { price: 4800, optionGroups: optionFixture() } });
  const cola = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Cola' }).orFail(); const available = cola.isAvailable;
  try {
    await dashboard.goto(`${base}/login`); await dashboard.getByRole('button', { name: 'English', exact: true }).click(); await dashboard.getByLabel('Email', { exact: true }).fill('takeaway@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password); await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(`${base}/dashboard`);
    await dashboard.goto(`${base}/dashboard/products`);
    const categories = await Category.find({ restaurantId: fixture.restaurantId }).sort({ sortOrder: 1, _id: 1 }).lean();
    const sections = dashboard.locator('section[data-testid^="product-category-"]'); const ids = await sections.evaluateAll(elements => elements.map(e => e.getAttribute('data-testid'))); assert.deepEqual(ids.slice(0, categories.length), categories.map(c => `product-category-${c._id}`));
    for (const category of categories) {
      const expected = await Product.find({ restaurantId: fixture.restaurantId, categoryId: category._id, isArchived: false }).sort({ sortOrder: 1, _id: 1 }).lean();
      assert.deepEqual(await dashboard.getByTestId(`product-category-${category._id}`).locator('article').evaluateAll(elements => elements.map(e => e.getAttribute('data-testid'))), expected.map(p => `managed-${p._id}`));
    }
    const burgers = dashboard.getByTestId(`product-category-${burger.categoryId}`).locator('article'); assert.ok(await burgers.count() >= 2); await expect(burgers.first()).toBeVisible(); await expect(burgers.nth(1)).toBeVisible();
    const boxes = await burgers.evaluateAll(elements => elements.slice(0, 2).map(e => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y }))); assert.equal(boxes[0].y, boxes[1].y); assert.notEqual(boxes[0].x, boxes[1].x);
    await dashboard.getByLabel('Search products', { exact: true }).fill('Classic Burger'); await expect(dashboard.getByTestId(`managed-${burger._id}`)).toBeVisible(); await expect(dashboard.getByTestId(`managed-${cola._id}`)).toHaveCount(0); await dashboard.getByLabel('Search products', { exact: true }).fill('');
    const colaCard = dashboard.getByTestId(`managed-${cola._id}`); if (!available) await colaCard.getByRole('button', { name: 'Unavailable', exact: true }).click(); await expect(colaCard.getByRole('button', { name: 'Available', exact: true })).toBeVisible(); await colaCard.getByRole('button', { name: 'Available', exact: true }).click(); await expect(colaCard.getByRole('button', { name: 'Unavailable', exact: true })).toBeVisible();
    await menu.goto(`${base}/r/salt?table=7`); await enterTableFixture(menu); await menu.getByRole('button', { name: 'English', exact: true }).click(); await expect(menu.getByRole('button', { name: 'Add Cola', exact: true }).first()).toBeDisabled();
    await colaCard.getByRole('button', { name: 'Unavailable', exact: true }).click(); await expect(colaCard.getByRole('button', { name: 'Available', exact: true })).toBeVisible();
    await menu.reload(); await enterTableFixture(menu); await menu.getByRole('button', { name: 'Add Cola', exact: true }).first().click(); await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await dashboard.getByTestId(`managed-${burger._id}`).getByRole('button', { name: 'Edit', exact: true }).click(); await expect(dashboard.getByTestId('options-entry')).toBeInViewport(); await expect(dashboard.getByTestId('option-group-editor')).toHaveCount(3); await dashboard.keyboard.press('Escape');
    for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
      await staff.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await dashboard.reload(); await expect(dashboard.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(dashboard.getByLabel(messages.ProductGrid.search, { exact: true })).toBeVisible();
      for (const width of [320, 768, 1280]) { await dashboard.setViewportSize({ width, height: 900 }); assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await dashboard.screenshot({ path: `test-artifacts/product-grid-${locale}.png`, fullPage: true });
    }
    await dashboard.getByRole('button', { name: 'English', exact: true }).click(); await dashboard.setViewportSize({ width: 1024, height: 900 });
    await dashboard.goto(`${base}/dashboard/qr-codes`); await expect(dashboard.getByTestId('takeaway-qr')).toContainText('/r/salt?mode=takeaway'); assert.equal((await dashboard.request.get(`${base}/api/dashboard/takeaway/qr`)).headers()['content-type'], 'image/png');
    await dashboard.goto(`${base}/dashboard/orders`); await expect(dashboard.getByText('Live updates connected', { exact: true })).toBeVisible(); await dashboard.getByRole('button', { name: 'Sound notifications', exact: true }).click(); await expect(dashboard.getByRole('button', { name: 'Sound notifications', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await menu.goto(`${base}/r/salt?mode=takeaway`); await expect(menu.getByRole('button', { name: 'Continue to menu', exact: true })).toBeVisible(); await expect(menu.locator('[data-product-id]')).toHaveCount(0);
    await menu.getByLabel('Name', { exact: true }).fill('Ahmad'); await menu.getByLabel('Phone number', { exact: true }).fill('bad'); await menu.getByRole('button', { name: 'Continue to menu', exact: true }).click(); await expect(menu.getByRole('alert').filter({ hasText: 'Enter a name' })).toBeVisible(); await menu.getByLabel('Phone number', { exact: true }).fill('0501234567'); await menu.getByRole('button', { name: 'Continue to menu', exact: true }).click(); await expect(menu.getByTestId('takeaway-mode')).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Service', exact: true })).toHaveCount(0); await expect(menu.locator('[data-testid^=customer-service-]')).toHaveCount(0);
    const cookies = await customer.cookies(`${base}/api/r/salt/takeaway/session`); const credential = cookies.find(c => c.name === 'dsmenu-takeaway-salt')!; assert.ok(credential.httpOnly); assert.ok(credential.secure);
    await menu.reload(); await expect(menu.getByTestId('takeaway-mode')).toBeVisible(); await expect(menu.getByLabel('Phone number', { exact: true })).toHaveCount(0);
    await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click(); const dialog = menu.getByRole('dialog'); await dialog.getByRole('checkbox', { name: 'Tomato', exact: true }).uncheck(); await dialog.getByRole('checkbox', { name: /Extra Cheese/ }).check(); await dialog.getByRole('radio', { name: 'Spicy', exact: true }).check();
    await dialog.getByRole('textbox').fill('Takeaway browser'); await dialog.getByRole('button', { name: /Add to My Order/ }).click(); await menu.reload(); await menu.getByTestId('my-order-button').click(); await expect(menu.getByTestId('cart-subtotal')).toContainText('53.00'); await expect(menu.getByTestId('cart-line')).toContainText('Without: Tomato');
    const storage = await menu.evaluate(() => JSON.stringify(localStorage)); assert.ok(!storage.includes(credential.value)); assert.ok(!storage.includes('0501234567')); assert.ok(storage.includes(':takeaway:'));
    await expect(menu.getByText('Live updates connected', { exact: true })).toBeVisible(); await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const order = await Order.findOne({ restaurantId: fixture.restaurantId, 'items.notes': 'Takeaway browser' }).orFail(); const card = dashboard.getByTestId(`staff-order-${order._id}`); await expect(card).toBeVisible(); await expect(card).toContainText('Take Away'); await expect(card).toContainText('Ahmad'); await expect(card).toContainText('0501234567'); await expect(card).toContainText('Extra Cheese'); await expect(dashboard.locator('html')).toHaveAttribute('data-takeaway-sounds', '1');
    for (const [action, status] of [['Start preparing', 'Preparing'], ['Mark ready', 'Your order is ready for pickup']]) { await card.getByRole('button', { name: action, exact: true }).click(); await expect(menu.getByTestId('submitted-order').first()).toContainText(status);
      if (action === 'Mark ready') {
        for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
          await customer.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await menu.reload(); await menu.getByTestId('my-order-button').click(); await expect(menu.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(menu.getByTestId('submitted-order').first()).toContainText(messages.Takeaway.ready); await menu.screenshot({ path: `test-artifacts/takeaway-ready-${locale}.png` });
        }
        await customer.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); await menu.reload(); await menu.getByTestId('my-order-button').click(); await expect(menu.getByText('Live updates connected', { exact: true })).toBeVisible();
      }
    }
    await expect(card).toHaveCount(0); await dashboard.getByRole('button', { name: 'Recent history', exact: true }).click(); await expect(card).toContainText('Ready'); assert.equal((await Order.findById(order._id).orFail()).status, 'READY');
    await menu.screenshot({ path: 'test-artifacts/takeaway-ready.png' }); await dashboard.screenshot({ path: 'test-artifacts/takeaway-staff.png' });
    await menu.keyboard.press('Escape'); await TakeawaySession.updateOne({ _id: order.takeawaySessionId }, { $set: { expiresAt: new Date(0) } }); await menu.reload(); await expect(menu.getByLabel('Name', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []); console.log('PASS: category grid ordering/search/availability/options/RTL and takeaway QR, entry, session/cart refresh, options, private realtime staff/customer status, pickup history and expiry.');
  } catch (error) { await menu.screenshot({ path: 'test-artifacts/takeaway-failure.png' }).catch(() => {}); await dashboard.screenshot({ path: 'test-artifacts/takeaway-staff-failure.png' }).catch(() => {}); throw error; }
  finally { await Product.updateOne({ _id: burger._id }, { $set: previous }); await Product.updateOne({ _id: cola._id }, { $set: { isAvailable: available } }); await staff.close(); await customer.close(); await browser.close(); }
}
