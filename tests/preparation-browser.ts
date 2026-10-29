import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect, type Page } from '@playwright/test';
import { Order, Table, TableSession, Product, KitchenPrintState } from '../src/models';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import type { TableSessionBill } from '../src/types/table-bill';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';

export async function runPreparationBrowserChecks(base: string, fixture: StaffFixture) {
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const customerA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customerB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customerA); await mockRealtime(customerB);
  const dashboard = await staff.newPage(); const a = await customerA.newPage(); const b = await customerB.newPage();
  const errors: string[] = []; for (const page of [dashboard, a, b]) page.on('pageerror', error => errors.push(error.message));
  const burger = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const dessert = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Cheesecake' }).orFail();
  const availability = dessert.isAvailable; await Product.updateOne({ _id: dessert._id }, { $set: { isAvailable: true } });
  try {
    await dashboard.goto(base + '/login'); await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill('preparation@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password); await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(base + '/dashboard');
    await dashboard.goto(base + '/dashboard/orders');
    await expect(dashboard.getByText('Live updates connected', { exact: true })).toBeVisible();
    for (const page of [a, b]) { await page.goto(base + '/r/salt?table=7'); await enterTableFixture(page); await page.getByRole('button', { name: 'English', exact: true }).click(); }
    const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 7 }).orFail();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    assert.equal(await Order.countDocuments({ tableSessionId: visit._id }), 0, 'fresh visit after final-bill scenario');
    async function send(page: Page, names: string[], note: string) {
      for (const name of names) {
        await page.getByRole('button', { name: `Add ${name}`, exact: true }).first().click();
        await page.getByRole('dialog').getByRole('textbox').fill(note);
        await page.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
      }
      await page.getByTestId('my-order-button').click(); await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible(); await page.getByTestId('send-order').click(); await expect(page.getByTestId('order-success')).toBeVisible();
    }
    await send(a, ['Classic Burger', 'Fries'], 'Customer A: no mayo');
    const first = await Order.findOne({ tableSessionId: visit._id, orderNumber: 1 }).orFail();
    await expect(dashboard.getByTestId(`staff-order-${first._id}`)).toBeVisible();
    await send(b, ['Cola', 'Cheesecake'], 'Customer B');
    const second = await Order.findOne({ tableSessionId: visit._id, orderNumber: 2 }).orFail();
    const section = dashboard.getByTestId(`order-group-${visit._id}`);
    const group = section.getByTestId('preparation-card');
    await expect(group).toHaveCount(1); await expect(group).toContainText('2 new orders');
    await expect(group.getByTestId(`staff-order-${first._id}`)).toContainText('Customer A: no mayo');
    await expect(group.getByTestId(`staff-order-${second._id}`)).toContainText('Customer B');
    await expect(group.getByRole('button', { name: 'Start preparing all', exact: true })).toHaveCount(1);
    await expect(group.getByTestId('kitchen-print-action')).toHaveCount(0);
    await group.getByRole('button', { name: 'Start preparing all', exact: true }).click();
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('2 orders preparing');
    await expect(group.getByTestId(`staff-order-${first._id}`)).toBeVisible();
    await expect(group.getByTestId(`staff-order-${second._id}`)).toBeVisible();
    await expect(group.getByRole('button', { name: 'Mark all ready', exact: true })).toHaveCount(1);
    await expect(group.getByRole('button', { name: 'Mark ready', exact: true })).toHaveCount(0);
    const prepared = await Order.find({ _id: { $in: [first._id, second._id] } }).lean();
    assert.ok(prepared.every(order => order.status === 'PREPARING' && order.preparationBatchId));
    assert.equal(String(prepared[0].preparationBatchId), String(prepared[1].preparationBatchId));
    await expect(a.getByTestId('submitted-order')).toHaveCount(2);
    await expect(a.getByTestId('submitted-order').first()).toContainText('Preparing');
    await dashboard.reload(); await expect(group).toContainText('2 orders preparing');
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('button', { name: 'Mark all ready', exact: true })).toHaveCount(1);
    await expect(group).toContainText('Customer A: no mayo');
    await a.keyboard.press('Escape'); await send(a, ['Classic Burger'], 'Customer A: extra toasted');
    await expect.poll(() => Order.countDocuments({ tableSessionId: visit._id })).toBe(3);
    const third = await Order.findOne({ tableSessionId: visit._id, orderNumber: 3 }).orFail();
    const thirdCard = section.getByTestId(`staff-order-${third._id}`);
    await expect(thirdCard).toBeVisible(); await expect(group.getByTestId(`staff-order-${third._id}`)).toHaveCount(0);
    await expect(thirdCard.getByRole('button', { name: 'Start preparing', exact: true })).toBeVisible();
    const { checkGroupedKitchenPrinting } = await import('./kitchen-print-browser');
    await checkGroupedKitchenPrinting(dashboard, group, base, String(prepared[0].preparationBatchId));
    for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
      await staff.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await dashboard.reload(); await expect(group.getByRole('button', { name: messages.LiveOrders.readyGroup, exact: true })).toBeVisible(); await expect(dashboard.locator('html')).toHaveAttribute('dir', 'rtl');
      for (const width of [390, 768, 1280]) { await dashboard.setViewportSize({ width, height: 900 }); assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await dashboard.screenshot({ path: `test-artifacts/preparation-group-${locale}.png`, fullPage: true });
    }
    await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await group.getByRole('button', { name: 'Mark all ready', exact: true }).click();
    await expect(group).toHaveCount(0); await expect(thirdCard).toBeVisible();
    assert.equal(await Order.countDocuments({ tableSessionId: visit._id, status: 'READY' }), 2);
    assert.equal((await Order.findById(third._id).orFail()).status, 'NEW');
    assert.equal((await TableSession.findById(visit._id).orFail()).status, 'ACTIVE');
    await expect(b.getByTestId('submitted-order')).toHaveCount(3);
    await dashboard.getByRole('button', { name: 'Recent history', exact: true }).click();
    await expect(section.getByTestId(`staff-order-${first._id}`)).toContainText('Ready'); await expect(section.getByTestId(`staff-order-${second._id}`)).toContainText('Ready'); await expect(group).toHaveCount(0);
    const billResponse = await staff.request.get(`${base}/api/dashboard/tables/${table._id}/bill?sessionId=${visit._id}`); assert.equal(billResponse.status(), 200);
    const bill = await billResponse.json() as TableSessionBill;
    assert.deepEqual(bill.orders.map(order => order.orderNumber), [1, 2, 3]); assert.equal(bill.finalTotal, first.subtotal + second.subtotal + third.subtotal); assert.equal(bill.canClose, false);
    await dashboard.getByRole('button', { name: 'All active', exact: true }).click();
    await thirdCard.getByRole('button', { name: 'Start preparing', exact: true }).click();
    await expect(thirdCard.getByRole('link', { name: 'Print Kitchen Ticket', exact: true })).toBeVisible();
    await thirdCard.getByRole('button', { name: 'Mark ready', exact: true }).click();
    await expect(thirdCard).toHaveCount(0);
    const unprinted = await Order.findById(third._id).orFail();
    assert.equal(unprinted.status, 'READY');
    assert.equal(await KitchenPrintState.countDocuments({ unitId: unprinted.preparationBatchId }), 0);
    assert.deepEqual(errors, []);
    assert.ok(bill.orders[0].items.some(item => item.productId === String(burger._id)));
    console.log('PASS: two Table 7 customers, realtime NEW grouping, one start/ready action, reload-stable preparation, separate later order, individual customer/history/bill totals and AR/HE/EN responsive layouts.');
  } finally { await Product.updateOne({ _id: dessert._id }, { $set: { isAvailable: availability } }); await browser.close(); }
}
