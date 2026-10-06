import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mockRealtime, realtimeTest } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import { Order, Table } from '../src/models';
import { restaurantChannel } from '../src/lib/realtime-channels';

export async function runLiveBrowserChecks(base: string, fixture: StaffFixture) {
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  // Observe actual Web Audio oscillator starts without replacing the sound logic.
  await staff.addInitScript(() => {
    let sounds = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { sounds++; document.documentElement.dataset.testSounds = String(sounds); return original.apply(this, args); };
  });
  const dashboard = await staff.newPage();
  const menu = await customer.newPage();
  const errors: string[] = [];
  dashboard.on('pageerror', error => errors.push(error.message)); menu.on('pageerror', error => errors.push(error.message));
  try {
    await dashboard.goto(`${base}/login`);
    await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill(fixture.email);
    await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password);
    await dashboard.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(dashboard).toHaveURL(`${base}/dashboard`);
    await dashboard.getByRole('link', { name: 'Live Orders', exact: true }).click();
    await expect(dashboard.getByText('Live updates connected', { exact: true })).toBeVisible();
    await dashboard.getByRole('button', { name: 'Sound notifications', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'Sound notifications', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await menu.goto(`${base}/r/salt?table=7`);
    await menu.getByRole('button', { name: 'English', exact: true }).click();
    await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    await menu.getByRole('dialog').getByRole('textbox').fill('Live test: no onion');
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click();
    await expect(menu.getByText('Live updates connected', { exact: true })).toBeVisible();
    await menu.getByTestId('send-order').click();
    await expect(menu.getByTestId('order-success')).toBeVisible();
    const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 7 }).orFail();
    const order = await Order.findOne({ restaurantId: fixture.restaurantId, tableId: table._id, 'items.notes': 'Live test: no onion' }).sort({ createdAt: -1 }).orFail();
    const card = dashboard.getByTestId(`staff-order-${order._id}`);
    await expect(card).toBeVisible(); await expect(card).toContainText('Live test: no onion');
    await expect(dashboard.locator('html')).toHaveAttribute('data-test-sounds', '1');
    const created = realtimeTest.events.at(-1)!;
    realtimeTest.broadcast(created); realtimeTest.broadcast(created);
    await dashboard.getByRole('button', { name: 'Refresh orders', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'Refresh orders', exact: true })).toBeEnabled();
    await expect(dashboard.locator('html')).toHaveAttribute('data-test-sounds', '1');
    const staffChannel = restaurantChannel(fixture.restaurantId);
    const existingSocket = [...realtimeTest.sockets].find(([, channels]) => channels.has(staffChannel))?.[0];
    assert.ok(existingSocket);
    const reconciled = dashboard.waitForResponse(response => response.url().endsWith('/api/dashboard/orders') && response.request().method() === 'GET');
    realtimeTest.sockets.delete(existingSocket);
    existingSocket.close({ code: 1012, reason: 'Test reconnect' });
    await expect.poll(() => [...realtimeTest.sockets].some(([socket, channels]) => socket !== existingSocket && channels.has(staffChannel)), { timeout: 15000 }).toBe(true);
    await reconciled;
    await expect(dashboard.getByText('Live updates connected', { exact: true })).toBeVisible();
    await expect(dashboard.locator('html')).toHaveAttribute('data-test-sounds', '1');
    await card.scrollIntoViewIfNeeded();
    await dashboard.screenshot({ path: 'test-artifacts/live-orders-en-tablet.png' });
    for (const [action, status] of [['Accept', 'Accepted'], ['Start preparing', 'Preparing'], ['Mark ready', 'Ready'], ['Mark served', 'Served']]) {
      await card.getByRole('button', { name: action, exact: true }).click();
      await expect(menu.getByTestId('submitted-order').filter({ hasText: 'Live test: no onion' })).toContainText(status);
    }
    await expect(card).toHaveCount(0);
    await dashboard.getByRole('button', { name: 'Recent history', exact: true }).click();
    await expect(card).toBeVisible(); await expect(card).toContainText('Served');
    assert.equal((await Order.findById(order._id).orFail()).status, 'SERVED');
    await expect(dashboard.locator('html')).toHaveAttribute('data-test-sounds', '1');
    await dashboard.getByRole('button', { name: 'Sound notifications', exact: true }).click();
    await menu.keyboard.press('Escape');
    await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    await menu.getByRole('dialog').getByRole('textbox').fill('Muted notification test');
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click();
    await menu.getByTestId('send-order').click();
    await expect(menu.getByTestId('order-success')).toBeVisible();
    await dashboard.getByRole('button', { name: 'All active', exact: true }).click();
    await expect(dashboard.getByText('Muted notification test', { exact: true })).toBeVisible();
    await expect(dashboard.locator('html')).toHaveAttribute('data-test-sounds', '1');
    await dashboard.reload();
    await expect(dashboard.getByRole('button', { name: 'Sound notifications', exact: true })).toHaveText('Sound off');
    await dashboard.getByRole('button', { name: 'עברית', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'עברית', exact: true })).toBeEnabled();
    await expect(dashboard.locator('html')).toHaveAttribute('dir', 'rtl');
    await dashboard.screenshot({ path: 'test-artifacts/live-orders-he-tablet.png' });
    for (const width of [390, 768, 1280]) {
      await dashboard.setViewportSize({ width, height: 900 });
      assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: live two-browser order delivery, sound dedupe/mute, reconnect revalidation, all staff transitions, automatic customer status, completed history and RTL.');
  } catch (error) {
    await dashboard.screenshot({ path: 'test-artifacts/live-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally { await staff.close(); await customer.close(); await browser.close(); }
}
