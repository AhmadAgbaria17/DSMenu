import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { Table, TableSession, Product, Order, ServiceCall } from '../src/models';
import { optionFixture } from './option-fixture';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
export async function runBillBrowserChecks(base: string, fixture: StaffFixture) {
  const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 7 }).orFail();
  // Finish only disposable test setup so this scenario starts a fresh Table 7 visit.
  const previousVisit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' });
  if (previousVisit) {
    await Order.updateMany({ tableSessionId: previousVisit._id, status: { $ne: 'CANCELLED' } }, { $set: { status: 'SERVED', servedAt: new Date() } });
    await ServiceCall.updateMany({ tableSessionId: previousVisit._id }, { $set: { status: 'RESOLVED', resolvedAt: new Date() } });
  }
  const burger = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const saved = { price: burger.price, optionGroups: burger.optionGroups.toObject() };
  await Product.updateOne({ _id: burger._id }, { $set: { price: 4800, optionGroups: [optionFixture()[0]] } });
  const common = { restaurantId: fixture.restaurantId, categoryId: burger.categoryId, isAvailable: true, isArchived: false };
  const fries = await Product.create({ ...common, nameAr: 'بطاطا', nameHe: 'צ׳יפס', nameEn: 'Fries', price: 1800 });
  const coffee = await Product.create({ ...common, nameAr: 'قهوة', nameHe: 'קפה', nameEn: 'Coffee', price: 1200 });
  const browser = await chromium.launch(); const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } }); const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  const page = await staff.newPage(); const menu = await customer.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); menu.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/login'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('Email', { exact: true }).fill('bill@salt.local'); await page.getByLabel('Password', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(base + '/dashboard');
    if (previousVisit) assert.equal((await staff.request.post(base + '/api/dashboard/tables/' + table._id + '/close', { headers: { Origin: base }, data: { sessionId: String(previousVisit._id) } })).status(), 200);
    await menu.goto(base + '/r/salt?table=7'); await menu.getByRole('button', { name: 'English', exact: true }).click();
    await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    await menu.getByRole('dialog').getByRole('button', { name: 'Increase Classic Burger quantity' }).click();
    await menu.getByRole('checkbox', { name: 'Tomato', exact: true }).uncheck();
    await menu.getByRole('textbox', { name: 'Special requests (optional)' }).fill('Final bill note');
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.locator('[data-product-id="' + fries._id + '"]').first().getByRole('button', { name: 'Add Fries', exact: true }).click();
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click(); await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    const first = await Order.findOne({ tableSessionId: visit._id, orderNumber: 1 }).orFail(); assert.equal(first.subtotal, 11400);
    await page.goto(base + '/dashboard/tables'); const row = page.getByTestId('table-7');
    await row.getByRole('button', { name: 'Close Session', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Complete or cancel active orders');
    await expect(page.getByTestId('bill-close')).toBeDisabled(); assert.equal((await TableSession.findById(visit._id).orFail()).status, 'ACTIVE');
    await page.keyboard.press('Escape');
    async function serve(id: string) {
      await page.goto(base + '/dashboard/orders');
      const card = page.getByTestId('staff-order-' + id);
      for (const action of ['Start preparing', 'Mark ready']) await card.getByRole('button', { name: action, exact: true }).click();
      await expect(card).toHaveCount(0);
    }
    await serve(String(first._id));
    await menu.keyboard.press('Escape'); await menu.locator('[data-product-id="' + coffee._id + '"]').first().getByRole('button', { name: 'Add Coffee', exact: true }).click(); await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click(); await menu.getByTestId('my-order-button').click(); await menu.getByTestId('send-order').click();
    await expect.poll(() => Order.countDocuments({ tableSessionId: visit._id })).toBe(2);
    const second = await Order.findOne({ tableSessionId: visit._id, orderNumber: 2 }).orFail(); await serve(String(second._id));
    await page.goto(base + '/dashboard/tables'); await row.getByRole('button', { name: 'Close Session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Final Bill', exact: true })).toBeVisible(); await expect(page.getByTestId('bill-order')).toHaveCount(2); await expect(page.getByTestId('bill-total')).toContainText('126.00');
    await expect(page.getByRole('dialog')).toContainText('Without: Tomato'); await expect(page.getByRole('dialog')).toContainText('Final bill note');
    assert.equal((await TableSession.findById(visit._id).orFail()).status, 'ACTIVE', 'opening bill does not close session');
    await page.screenshot({ path: 'test-artifacts/final-bill-en.png', fullPage: true });
    await page.getByTestId('bill-total').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-artifacts/final-bill-total-en.png' });
    for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
      await staff.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await page.reload(); await row.getByRole('button', { name: messages.Tables.closeVisit, exact: true }).click();
      await expect(page.getByRole('heading', { name: messages.Bill.final, exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.getByTestId('bill-order')).toHaveCount(2);
      for (const width of [390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await page.screenshot({ path: 'test-artifacts/final-bill-' + locale + '.png', fullPage: true });
    }
    await staff.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); await page.reload(); await row.getByRole('button', { name: 'Close Session', exact: true }).click(); await expect(page.getByTestId('bill-close')).toBeEnabled(); await page.getByTestId('bill-close').click(); await expect(row).toContainText('Available'); await expect(page.getByText('Session closed successfully.', { exact: true })).toBeVisible();
    const closed = await TableSession.findById(visit._id).orFail(); assert.equal(closed.status, 'CLOSED'); assert.ok(closed.closedAt); assert.equal(await Order.countDocuments({ tableSessionId: visit._id }), 2);
    assert.equal((await customer.request.post(base + '/api/r/salt/tables/7/orders', { headers: { Origin: base }, data: { clientRequestId: randomUUID(), items: [{ productId: String(coffee._id), quantity: 1, note: '' }] } })).status(), 409);
    assert.deepEqual(errors, []); console.log('PASS: Table 7 browser two burgers/fries then coffee, blocked running bill, two-action ready transitions, 126.00 final snapshot bill/options/notes, AR/HE RTL, reviewed close, availability and old credential rejection.');
  } finally { await Product.updateOne({ _id: burger._id }, { $set: saved }); await browser.close(); }
}
