import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mockRealtime } from './realtime-transport';
import { Order, Product, Restaurant, Table, TableSession } from '../src/models';

export async function runOrderBrowserChecks(base: string) {
  const restaurant = await Restaurant.findOne({ slug: 'salt' }).orFail();
  const table = await Table.findOne({ restaurantId: restaurant._id, tableNumber: 12 }).orFail();
  const burger = await Product.findOne({ restaurantId: restaurant._id, nameEn: 'Classic Burger' }).orFail();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await mockRealtime(context);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const endpoint = '**/api/r/salt/tables/12/orders';
  async function addBurger() {
    await page.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('textbox').fill('No onion');
    await page.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('send-order')).toBeEnabled();
  }
  try {
    await page.goto(`${base}/r/salt?table=12`);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await addBurger();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    const scope = { tableSessionId: visit._id };
    const cookies = (await context.cookies(`${base}/api/r/salt/tables/12/orders`)).filter(cookie => cookie.name.startsWith('dsmenu-visit-'));
    assert.equal(cookies.length, 1); assert.equal(cookies[0].httpOnly, true);
    assert.equal((await page.evaluate(() => document.cookie)).includes(cookies[0].value), false);
    assert.equal((await page.evaluate(() => JSON.stringify(localStorage))).includes(cookies[0].value), false);

    // Hold the real response after commit: the cart must stay intact until confirmation.
    await Product.updateOne({ _id: burger._id }, { $set: { price: 5200 } });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('send-order')).toBeDisabled();
    await expect.poll(() => Order.countDocuments(scope)).toBe(1);
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    release();
    await expect(page.getByTestId('order-success')).toContainText('52.00');
    await expect(page.getByTestId('cart-line')).toHaveCount(0);
    await expect(page.getByTestId('submitted-order')).toHaveCount(1);
    await page.unroute(endpoint);
    await page.keyboard.press('Escape');

    // A lost response after commit survives reload and retries the original UUID.
    await addBurger();
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fetch();
      await route.abort('failed');
    });
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('send-order')).toHaveText('Retry this order');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    assert.equal(await Order.countDocuments(scope), 2);
    await page.unroute(endpoint);
    await page.reload();
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('send-order')).toHaveText('Retry this order');
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('order-success')).toContainText('Order #2');
    await expect(page.getByTestId('cart-line')).toHaveCount(0);
    assert.equal(await Order.countDocuments(scope), 2);
    assert.equal(await TableSession.countDocuments({ tableId: table._id }), 1);
    await Order.updateOne({ ...scope, orderNumber: 2 }, { $set: { status: 'PREPARING' } });
    await page.getByRole('button', { name: 'Refresh status' }).click();
    await expect(page.getByTestId('submitted-order').first()).toContainText('Preparing');
    await page.getByTestId('submitted-order').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-artifacts/orders-en-mobile.png' });
    await page.keyboard.press('Escape');

    // Failed validation keeps and marks the whole selection, including on locale changes.
    await addBurger();
    await Product.updateOne({ _id: burger._id }, { $set: { isAvailable: false } });
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('cart-line')).toContainText('This item is no longer available');
    assert.equal(await Order.countDocuments(scope), 2);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'עברית', exact: true }).click();
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('cart-line').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-artifacts/orders-he-mobile.png' });
    await page.keyboard.press('Escape');
    await Product.updateOne({ _id: burger._id }, { $set: { isAvailable: true, price: 4800 } });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByTestId('my-order-button').click();
    await page.getByTestId('send-order').click();
    await expect(page.getByTestId('order-success')).toContainText('Order #3');
    await page.keyboard.press('Escape');

    await addBurger();
    await TableSession.updateOne({ _id: visit._id }, { $set: { status: 'CLOSED', closedAt: new Date() } });
    await page.getByTestId('send-order').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('This table visit has closed');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    assert.equal(await Order.countDocuments(scope), 3);
    assert.equal(await TableSession.countDocuments({ tableId: table._id }), 1);
    await page.reload();
    await page.getByTestId('my-order-button').click();
    await expect(page.getByTestId('send-order')).toBeEnabled();
    await expect(page.getByTestId('submitted-order')).toHaveCount(0);
    assert.equal(await TableSession.countDocuments({ tableId: table._id }), 2);
    assert.deepEqual(errors, []);
    console.log('PASS: browser order confirmation, current prices, lost-response retry after reload, history/status, failed cart retention, RTL and closed visit rejection.');
  } catch (error) {
    await page.screenshot({ path: 'test-artifacts/order-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await Product.updateOne({ _id: burger._id }, { $set: { price: burger.price, isAvailable: burger.isAvailable } });
    await context.close(); await browser.close();
  }
}
