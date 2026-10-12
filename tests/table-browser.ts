import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createStaffUser } from '../src/lib/staff-users';
import { Table, TableSession, Order } from '../src/models';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
export async function runTableBrowserChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Tables Staff', email: 'tables-browser@salt.local', password: fixture.password, role: 'STAFF' });
  const browser = await chromium.launch(); const staff = await browser.newContext({ viewport: { width: 1024, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  for (const context of [staff, customer]) await context.route('https://res.cloudinary.com/**', route => route.abort());
  const page = await staff.newPage(); const menu = await customer.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); menu.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${base}/login`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('tables-browser@salt.local'); await page.getByLabel('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(`${base}/dashboard`);
    await page.goto(`${base}/dashboard/tables`); await page.getByRole('button', { name: 'Add Table', exact: true }).click();
    await page.getByLabel('Table Number', { exact: true }).fill('16'); await page.getByLabel('Table Label', { exact: true }).fill('Window'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    const row = page.getByTestId('table-16'); await expect(row).toContainText('Available');
    await page.goto(`${base}/dashboard/qr-codes`); const qr = page.locator('#table-16');
    // Wait for the streamed route to settle; assert uniqueness before using strict locators.
    await expect(qr).toHaveCount(1); await expect(qr.getByTestId('qr-url')).toHaveText(`${base}/r/salt?table=16`);
    await qr.getByRole('button', { name: 'Copy Link', exact: true }).click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${base}/r/salt?table=16`);
    const download = page.waitForEvent('download'); await qr.getByRole('link', { name: 'Download PNG', exact: true }).click(); assert.equal((await download).suggestedFilename(), 'salt-table-16-qr.png');
    const printPage = page.waitForEvent('popup'); await qr.getByRole('link', { name: 'Print Card', exact: true }).click(); const print = await printPage; await print.waitForLoadState('load');
    await expect(print.locator('.qr-print-card')).toHaveCount(1);
    await expect(print.locator('.qr-print-card')).toContainText('Table 16'); await expect(print.locator('img[src^="https://res.cloudinary.com"]')).toHaveCount(0); await print.emulateMedia({ media: 'print' }); await print.locator('.qr-print-card').screenshot({ path: 'test-artifacts/table-16-print.png' }); const singlePdf = await print.pdf({ path: 'test-artifacts/table-16-card.pdf', preferCSSPageSize: true }); assert.equal((singlePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1); await print.close();
    const bulkPage = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Print All Active Tables', exact: true }).click(); const bulk = await bulkPage; await bulk.waitForLoadState('load');
    const activeCount = await Table.countDocuments({ restaurantId: fixture.restaurantId, isActive: true }); await expect(bulk.locator('.qr-print-card')).toHaveCount(activeCount); await bulk.emulateMedia({ media: 'print' }); await expect(bulk.locator('.qr-print-card').first()).toBeVisible(); await expect(bulk.locator('.qr-print-card').first()).toHaveCSS('break-after', 'page'); const bulkPdf = await bulk.pdf({ path: 'test-artifacts/all-table-cards.pdf', preferCSSPageSize: true }); assert.equal((bulkPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, activeCount); await bulk.close();
    await menu.goto(`${base}/r/salt?table=16`); await menu.getByRole('button', { name: 'English', exact: true }).click();
    const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 16 }).orFail();
    await expect.poll(() => TableSession.countDocuments({ tableId: table._id, status: 'ACTIVE' })).toBe(1);
    await page.goto(`${base}/dashboard/tables`); await expect(row).toContainText('Occupied');
    await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click(); await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click(); await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail(); const order = await Order.findOne({ tableSessionId: visit._id }).orFail();
    await row.getByRole('button', { name: 'Close Session', exact: true }).click(); await page.getByRole('button', { name: 'Confirm Close', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Complete or cancel active orders'); await page.keyboard.press('Escape');
    const cancelled = await staff.request.patch(`${base}/api/dashboard/orders/${order._id}`, { headers: { Origin: base }, data: { expectedStatus: 'NEW', status: 'CANCELLED' } }); assert.equal(cancelled.status(), 200);
    await row.getByRole('button', { name: 'Close Session', exact: true }).click(); await page.getByRole('button', { name: 'Confirm Close', exact: true }).click(); await expect(row).toContainText('Available');
    const old = await customer.request.post(`${base}/api/r/salt/tables/16/orders`, { headers: { Origin: base }, data: { clientRequestId: randomUUID(), items: [{ productId: String(order.items[0].productId), quantity: 1, note: '' }] } }); assert.equal(old.status(), 409);
    await menu.reload(); await expect.poll(() => TableSession.countDocuments({ tableId: table._id, status: 'ACTIVE', _id: { $ne: visit._id } })).toBe(1);
    for (const width of [390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.getByRole('heading', { name: 'الطاولات', exact: true })).toBeVisible(); await page.screenshot({ path: 'test-artifacts/tables-ar.png' });
    await page.getByRole('button', { name: 'עברית', exact: true }).click(); await expect(page.getByRole('heading', { name: 'שולחנות', exact: true })).toBeVisible();
    assert.deepEqual(errors, []); console.log('PASS: Table 16 browser create, QR URL/copy/PNG/print, occupied state, blocked/safe closure, old credential rejection, next visit, responsive AR/HE/EN.');
  } finally { await staff.close(); await customer.close(); await browser.close(); }
}
