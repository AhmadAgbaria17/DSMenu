import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Product, Order } from '../src/models';
import { createStaffUser } from '../src/lib/staff-users';
import { optionFixture } from './option-fixture';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';

export async function runOptionsBrowserChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Options Staff', email: 'options-browser@salt.local', password: fixture.password, role: 'STAFF' });
  const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const previous = product.toObject();
  await Product.updateOne({ _id: product._id }, { $set: { price: 4800, isAvailable: true, isArchived: false, optionGroups: [] } });
  const browser = await chromium.launch(); const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } }); const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  for (const context of [staff, customer]) await context.route('https://res.cloudinary.com/**', route => route.abort());
  const dashboard = await staff.newPage(); const menu = await customer.newPage(); const errors: string[] = [];
  dashboard.on('pageerror', error => errors.push(error.message)); menu.on('pageerror', error => errors.push(error.message));
  try {
    await dashboard.goto(`${base}/login`); await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill('options-browser@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password); await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(`${base}/dashboard`);
    await dashboard.goto(`${base}/dashboard/products`); await dashboard.getByTestId(`managed-${product._id}`).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dashboard.getByTestId('options-entry')).toBeInViewport();
    await expect(dashboard.getByTestId('options-entry').getByRole('button', { name: 'Add option group', exact: true })).toBeInViewport();
    await dashboard.screenshot({ path: 'test-artifacts/options-entry-tablet.png' });
    const groups = optionFixture();
    for (const [i, group] of groups.entries()) {
      await dashboard.getByRole('button', { name: 'Add option group', exact: true }).click(); const editor = dashboard.getByTestId('option-group-editor').nth(i);
      for (const [lang, field] of [['Arabic', 'nameAr'], ['Hebrew', 'nameHe'], ['English', 'nameEn']] as const) await editor.getByLabel(`Group name — ${lang}`, { exact: true }).fill(group[field]);
      await editor.getByLabel('Selection type', { exact: true }).selectOption(group.type);
      await editor.getByLabel('Maximum selections', { exact: true }).fill(String(group.maxSelections));
      await editor.getByLabel('Minimum selections', { exact: true }).fill(String(group.minSelections));
      if (group.required) await editor.getByLabel('Required', { exact: true }).check();
      for (const [j, option] of group.options.entries()) {
        await editor.getByRole('button', { name: 'Add option', exact: true }).click(); const row = editor.getByTestId('option-editor').nth(j);
        for (const [lang, field] of [['Arabic', 'nameAr'], ['Hebrew', 'nameHe'], ['English', 'nameEn']] as const) await row.getByLabel(`Option name — ${lang}`, { exact: true }).fill(option[field]);
        if (group.type !== 'INCLUDED') await row.getByLabel('Extra price (₪)', { exact: true }).fill((option.priceDelta / 100).toFixed(2));
        await row.getByLabel('Selected by default', { exact: true }).setChecked(option.isDefault);
      }
    }
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    await dashboard.screenshot({ path: 'test-artifacts/options-editor-tablet.png' }); await dashboard.keyboard.press('Escape');
    await menu.goto(`${base}/r/salt?table=7`); await enterTableFixture(menu); await expect(menu.locator('html')).toHaveAttribute('dir', 'rtl');
    await menu.getByRole('button', { name: 'English', exact: true }).click(); await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    const dialog = menu.getByRole('dialog'); await expect(dialog.getByLabel('Tomato', { exact: true })).toBeChecked(); await dialog.getByLabel('Tomato', { exact: true }).uncheck();
    await dialog.getByRole('checkbox', { name: /Extra Cheese/ }).check();
    await dialog.getByRole('checkbox', { name: /Egg/ }).check(); await expect(dialog.getByRole('checkbox', { name: /Extra Patty/ })).toBeDisabled(); await dialog.getByRole('checkbox', { name: /Egg/ }).uncheck();
    await dialog.getByRole('radio', { name: 'Spicy', exact: true }).check(); await expect(dialog.getByRole('radio', { name: 'Regular', exact: true })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Increase Classic Burger quantity' }).click(); await dialog.getByRole('textbox', { name: 'Order notes (optional)' }).fill('Options browser note');
    await expect(dialog.getByRole('button', { name: /Add to My Order/ })).toContainText('106.00'); await menu.screenshot({ path: 'test-artifacts/options-customer-en.png' });
    await dialog.getByRole('button', { name: /Add to My Order/ }).click(); await menu.reload(); await enterTableFixture(menu); await menu.getByTestId('my-order-button').click();
    await expect(menu.getByTestId('cart-subtotal')).toContainText('106.00'); await expect(menu.getByTestId('cart-line')).toContainText('Without: Tomato'); await expect(menu.getByTestId('cart-line')).toContainText('Extra Cheese');
    await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const historical = await Order.findOne({ restaurantId: fixture.restaurantId, 'items.notes': 'Options browser note' }).orFail();
    assert.equal(historical.subtotal, 10600); await expect(menu.getByTestId('submitted-order').filter({ hasText: 'Options browser note' })).toContainText('Spicy');
    await dashboard.goto(`${base}/dashboard/orders`); const live = dashboard.getByRole('main').getByTestId(`staff-order-${historical._id}`); await expect(live).toBeVisible(); await expect(live).toContainText('Without: Tomato'); await expect(live).toContainText('Extra Cheese'); await expect(live).toContainText('Spicy');
    await dashboard.goto(`${base}/dashboard/products`); await dashboard.getByTestId(`managed-${product._id}`).getByRole('button', { name: 'Edit', exact: true }).click();
    await dashboard.getByTestId('option-group-editor').nth(1).getByTestId('option-editor').first().getByLabel('Extra price (₪)', { exact: true }).fill('6.00'); await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    assert.equal((await Order.findById(historical._id).orFail()).items[0].price, 5300);
    await menu.keyboard.press('Escape'); await menu.reload(); await enterTableFixture(menu); await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click(); await dialog.getByRole('checkbox', { name: /Extra Cheese/ }).check(); await dialog.getByRole('button', { name: /Add to My Order/ }).click();
    // Deactivate a selected option through the real editor; persisted cart must stop submission.
    await dashboard.getByTestId('option-group-editor').nth(1).getByTestId('option-editor').first().getByLabel('Active', { exact: true }).uncheck(); await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    await menu.reload(); await enterTableFixture(menu); await menu.getByTestId('my-order-button').click(); await expect(menu.getByRole('alert').filter({ hasText: 'Options changed' })).toBeVisible(); await expect(menu.getByTestId('send-order')).toBeDisabled();
    await menu.keyboard.press('Escape');
    for (const [language, dir, tomato] of [['العربية', 'rtl', 'طماطم'], ['עברית', 'rtl', 'עגבנייה'], ['English', 'ltr', 'Tomato']]) {
      await menu.getByRole('button', { name: language, exact: true }).click(); await expect(menu.locator('html')).toHaveAttribute('dir', dir);
      await menu.locator(`[data-product-id="${product._id}"]`).first().getByRole('button').first().click(); await expect(dialog.getByRole('checkbox', { name: tomato, exact: true })).toBeVisible();
      assert.ok(await menu.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await menu.screenshot({ path: `test-artifacts/options-${dir}-${tomato === 'Tomato' ? 'en' : dir === 'rtl' && language === 'العربية' ? 'ar' : 'he'}.png` }); await menu.keyboard.press('Escape');
    }
    // Change ordering through the UI, rather than modifying the product in MongoDB.
    const editors = dashboard.getByTestId('option-group-editor');
    await editors.nth(0).getByLabel('Sort order', { exact: true }).first().fill('10');
    await editors.nth(1).getByLabel('Sort order', { exact: true }).first().fill('20');
    await editors.nth(2).getByLabel('Sort order', { exact: true }).first().fill('0');
    for (let index = 0; index < 4; index++) await editors.nth(0).getByTestId('option-editor').nth(index).getByLabel('Sort order', { exact: true }).fill(String(index === 3 ? 0 : index + 1));
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    await menu.reload(); await enterTableFixture(menu); await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    assert.deepEqual(await dialog.locator('legend').allTextContents(), ['Sauce', 'Vegetables', 'Extras']);
    assert.deepEqual(await dialog.getByRole('group', { name: 'Vegetables', exact: true }).locator('label').allTextContents(), ['Onion', 'Lettuce', 'Tomato', 'Pickles']); await menu.keyboard.press('Escape');
    dashboard.once('dialog', prompt => prompt.accept()); await editors.nth(2).getByTestId('option-editor').nth(1).getByRole('button', { name: 'Remove option', exact: true }).click();
    await editors.nth(2).getByTestId('option-editor').first().getByLabel('Selected by default', { exact: true }).uncheck();
    await editors.nth(0).getByLabel('Active', { exact: true }).first().uncheck();
    dashboard.once('dialog', prompt => prompt.accept()); await editors.nth(1).getByRole('button', { name: 'Remove group', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    await menu.reload(); await enterTableFixture(menu); await menu.getByRole('button', { name: 'Add Classic Burger', exact: true }).first().click();
    assert.deepEqual(await dialog.locator('legend').allTextContents(), ['Sauce']); await expect(dialog.getByRole('radio', { name: 'Spicy', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Add to My Order/ })).toBeDisabled(); await dialog.getByRole('radio', { name: 'No Sauce', exact: true }).check(); await expect(dialog.getByRole('button', { name: /Add to My Order/ })).toBeEnabled(); await menu.keyboard.press('Escape');
    assert.equal((await Order.findById(historical._id).orFail()).items[0].optionGroups[1].selected[0].nameEn, 'Extra Cheese');
    await dashboard.keyboard.press('Escape');
    for (const language of ['العربية', 'עברית']) {
      await dashboard.getByRole('button', { name: language, exact: true }).click(); await dashboard.getByTestId(`managed-${product._id}`).getByRole('button').first().click();
      await expect(dashboard.getByTestId('options-entry')).toBeInViewport(); await expect(dashboard.locator('html')).toHaveAttribute('dir', 'rtl'); await dashboard.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []); console.log('PASS: visible dashboard options entry, creation/edit/reorder/removal/deactivation, included removals, paid extras, required single choice, quantity/cart persistence, snapshots, staff/customer summaries, stale review, AR/HE/EN and RTL.');
  } catch (error) {
    await dashboard.screenshot({ path: 'test-artifacts/options-staff-failure.png' }).catch(() => {});
    await menu.screenshot({ path: 'test-artifacts/options-customer-failure.png' }).catch(() => {});
    throw error;
  } finally { await Product.updateOne({ _id: product._id }, { $set: { optionGroups: previous.optionGroups, price: previous.price, isAvailable: previous.isAvailable, isArchived: previous.isArchived } }); await staff.close(); await customer.close(); await browser.close(); }
}
