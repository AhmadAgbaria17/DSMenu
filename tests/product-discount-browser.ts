import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Product, Table, TableSession, Order } from '../src/models';
import { enterTableFixture } from './table-access-fixture';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

export async function runDiscountBrowserChecks(base: string, fixture: StaffFixture, product: { id: string }) {
  const browser = await chromium.launch();
  const staff = await browser.newContext(); const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  const dashboard = await staff.newPage(); const menu = await customer.newPage();
  const table = await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 431 });
  try {
    await dashboard.goto(base + '/login'); await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill('discount@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password);
    await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(base + '/dashboard');
    async function edit(value: string) {
      await dashboard.goto(base + '/dashboard/products');
      await dashboard.getByRole('main').getByTestId(`managed-${product.id}`).getByRole('button', { name: 'Edit', exact: true }).click();
      await dashboard.getByLabel(en.Discount.optional, { exact: true }).fill(value);
      await dashboard.getByRole('button', { name: 'Save', exact: true }).click();
    }
    await edit('48'); await expect(dashboard.getByRole('dialog')).toContainText(en.Discount.lower);
    await dashboard.getByLabel(en.Discount.optional, { exact: true }).fill('39');
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    for (const [locale, messages, width] of [['ar', ar, 320], ['ar', ar, 390], ['he', he, 768], ['en', en, 1280]] as const) {
      await customer.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await menu.setViewportSize({ width, height: 900 });
      await menu.goto(base + '/r/salt?table=431'); await enterTableFixture(menu);
      const card = menu.locator(`[data-product-id="${product.id}"]`).first();
      await expect(card.locator('del')).toBeVisible(); await expect(card.getByTestId('current-price')).toBeVisible();
      await expect(menu.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      await card.getByRole('button').first().click(); const dialog = menu.getByRole('dialog');
      await expect(dialog.locator('del')).toBeVisible(); await expect(dialog).toContainText(messages.Discount.originalPrice);
      await menu.keyboard.press('Escape');
      assert.equal(await menu.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await menu.getByRole('searchbox').fill('Discount Burger');
    await expect(menu.locator(`[data-product-id="${product.id}"]`).first().locator('del')).toContainText('48.00');
    await expect(menu.locator(`[data-product-id="${product.id}"]`).first().getByTestId('current-price')).toContainText('39.00');
    await menu.getByRole('searchbox').fill('');
    await menu.locator(`[data-product-id="${product.id}"]`).first().getByRole('button').first().click();
    await menu.getByRole('checkbox', { name: /Extra Cheese/ }).check();
    await menu.getByRole('button', { name: 'Increase Discount Burger quantity', exact: true }).click();
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click(); await expect(menu.getByTestId('cart-subtotal')).toContainText('88.00');
    await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    const order = await Order.findOne({ tableSessionId: visit._id }).orFail(); assert.equal(order.subtotal, 8800);
    await edit(''); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    assert.equal((await Product.findById(product.id).orFail()).discountPrice, null);
    await menu.reload(); await enterTableFixture(menu);
    await expect(menu.locator(`[data-product-id="${product.id}"]`).first().locator('del')).toHaveCount(0);
    assert.equal((await Order.findById(order._id).orFail()).subtotal, 8800);
    console.log('PASS: dashboard discount validation/save/removal, AR/HE/EN cards/details, RTL/LTR responsive layout, extras/quantity/cart submission and preserved order totals.');
  } finally { await browser.close(); }
}
