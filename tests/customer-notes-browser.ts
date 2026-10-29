import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Order, Product, Table, TableSession } from '../src/models';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';
import { optionGroupsSchema } from '../src/lib/product-options';

export async function runCustomerNotesBrowserChecks(base: string, fixture: StaffFixture, products: { burgerId: string; colaId: string }) {
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  const dashboard = await staff.newPage(); const menu = await customer.newPage();
  const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 209 });
  const originalOptions = optionGroupsSchema.parse((await Product.findById(products.burgerId).orFail()).optionGroups.toObject());
  const note = 'بدون مايونيز';
  try {
    await dashboard.goto(base + '/login'); await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill('notes@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password);
    await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(base + '/dashboard');
    async function toggle(id: string, enabled: boolean) {
      await dashboard.goto(base + '/dashboard/products');
      await dashboard.getByTestId(`managed-${id}`).getByRole('button', { name: 'Edit', exact: true }).click();
      await dashboard.getByLabel('Allow customer notes', { exact: true }).setChecked(enabled);
      await dashboard.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
      assert.equal((await Product.findById(id).orFail()).allowCustomerNote, enabled);
    }
    await toggle(products.burgerId, true);
    await toggle(products.colaId, true); await toggle(products.colaId, false);
    for (const [locale, messages] of [['ar', ar], ['he', he], ['en', en]] as const) {
      await customer.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]);
      await menu.goto(base + '/r/salt?table=209'); await enterTableFixture(menu);
      await menu.locator(`[data-product-id="${products.burgerId}"]`).first().getByRole('button').first().click();
      await expect(menu.getByRole('textbox', { name: messages.Shopping.note, exact: true })).toHaveAttribute('placeholder', messages.Shopping.notePlaceholder);
      await expect(menu.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      await menu.keyboard.press('Escape');
      await menu.locator(`[data-product-id="${products.colaId}"]`).first().getByRole('button').first().click();
      await expect(menu.getByRole('dialog').locator('textarea')).toHaveCount(0);
      await expect(menu.getByRole('dialog').getByRole('radio')).not.toHaveCount(0);
      await expect(menu.getByRole('dialog').getByRole('button', { name: messages.Shopping.addToOrder, exact: false })).toBeEnabled();
      await menu.keyboard.press('Escape');
    }
    await customer.addCookies([{ name: 'dsmenu-language', value: 'ar', url: base }]); await menu.reload(); await enterTableFixture(menu);
    await menu.locator(`[data-product-id="${products.burgerId}"]`).first().getByRole('button').first().click();
    await menu.getByRole('textbox', { name: ar.Shopping.note, exact: true }).fill(note);
    await menu.getByRole('dialog').getByRole('button', { name: ar.Shopping.addToOrder, exact: false }).click();
    await menu.reload(); await enterTableFixture(menu); await menu.getByTestId('my-order-button').click();
    await expect(menu.getByTestId('cart-line')).toContainText(note);
    await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    const order = await Order.findOne({ tableSessionId: visit._id }).orFail(); assert.equal(order.items[0].notes, note);
    await toggle(products.burgerId, false);
    assert.equal((await Order.findById(order._id).orFail()).items[0].notes, note);
    assert.deepEqual((await Product.findById(products.burgerId).orFail()).optionGroups.toObject(), originalOptions);
    await dashboard.goto(base + '/dashboard/orders');
    const group = dashboard.getByTestId(`order-group-${visit._id}`);
    await expect(group).toContainText(note);
    await group.getByRole('button', { name: 'Start preparing', exact: true }).click();
    const popup = staff.waitForEvent('page');
    await group.getByRole('link', { name: 'Print Kitchen Ticket', exact: true }).click();
    const ticket = await popup; await expect(ticket.getByTestId('kitchen-ticket')).toContainText(note); await ticket.close();
    // Stored drafts keep their instructions visible, block sending, and allow explicit removal.
    await customer.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); await menu.reload(); await enterTableFixture(menu);
    await menu.evaluate(({ restaurantId, productId, selections }) => {
      localStorage.setItem(`dsmenu-cart:v1:${restaurantId}:209`, JSON.stringify({ version: 1, restaurantId, tableNumber: 209, items: [{ productId, quantity: 1, note: 'Old instruction', selections }] }));
    }, { restaurantId: fixture.restaurantId, productId: products.burgerId, selections: originalOptions.map(g => ({ groupId: g.id, optionIds: g.options.filter(o => o.isDefault).map(o => o.id) })) });
    await menu.reload(); await enterTableFixture(menu); await menu.getByTestId('my-order-button').click();
    await expect(menu.getByTestId('cart-line')).toContainText('Old instruction');
    await expect(menu.getByTestId('send-order')).toBeDisabled();
    await expect(menu.getByTestId('cart-line').locator('textarea')).toHaveCount(0);
    await menu.getByRole('button', { name: 'Remove note', exact: true }).click();
    await expect(menu.getByTestId('cart-line')).not.toContainText('Old instruction');
    await expect(menu.getByTestId('send-order')).toBeEnabled();
    console.log('PASS: staff note toggles, localized labels/placeholders AR/HE/EN, hidden disabled textarea, options unchanged, cart persistence/review, Arabic order snapshot, live staff note and historical kitchen ticket.');
  } finally { await browser.close(); }
}
