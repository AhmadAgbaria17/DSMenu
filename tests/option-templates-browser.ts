import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Product, ProductOptionTemplate } from '../src/models';
import { optionFixture } from './option-fixture';
import { mockRealtime } from './realtime-transport';
import type { StaffFixture } from './staff-http';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
export async function runTemplateBrowserChecks(base: string, fixture: StaffFixture) {
  const burger = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Classic Burger' }).orFail();
  const previous = burger.optionGroups.toObject();
  await Product.updateOne({ _id: burger._id }, { $set: { optionGroups: optionFixture() } });
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  const page = await staff.newPage(); const menu = await customer.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); menu.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/login'); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('templates@salt.local'); await page.getByLabel('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(base + '/dashboard');
    await page.goto(base + '/dashboard/products');
    await page.getByTestId('managed-' + burger._id).getByRole('button', { name: 'Edit', exact: true }).click();
    const vegetables = page.getByTestId('option-group-editor').first();
    await expect(vegetables.getByTestId('option-editor')).toHaveCount(4);
    page.once('dialog', dialog => dialog.accept('Burger Vegetables'));
    await vegetables.getByRole('button', { name: 'Save as Template', exact: true }).click();
    await expect(vegetables.getByText('Template saved', { exact: true })).toBeVisible();
    const template = await ProductOptionTemplate.findOne({ restaurantId: fixture.restaurantId, templateName: 'Burger Vegetables' }).orFail();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await page.getByLabel('Name (Arabic)', { exact: true }).fill('Double Burger');
    await page.getByLabel('Name (Hebrew)', { exact: true }).fill('Double Burger');
    await page.getByLabel('Name (English)', { exact: true }).fill('Double Burger');
    await page.getByLabel('Category', { exact: true }).selectOption(String(burger.categoryId));
    await page.getByLabel('Price (₪)', { exact: true }).fill('60.00');
    await page.getByRole('button', { name: 'Use Saved Group', exact: true }).click();
    await page.getByLabel('Search templates', { exact: true }).fill('Burger Vegetables');
    await page.getByRole('button', { name: 'Burger Vegetables', exact: true }).click();
    await expect(page.getByTestId('option-group-editor')).toHaveCount(1);
    await page.getByRole('button', { name: 'Burger Vegetables — Already added', exact: true }).click();
    await expect(page.getByTestId('option-group-editor')).toHaveCount(1);
    // Select the fieldset by its English option input, not translated visible text.
    const pickleRow = page.getByTestId('option-editor').filter({ has: page.locator('input[value="Pickles"]') });
    page.once('dialog', dialog => dialog.accept()); await pickleRow.getByRole('button', { name: 'Remove option', exact: true }).click();
    await expect(page.getByTestId('option-editor')).toHaveCount(3);
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible();
    const double = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Double Burger' }).orFail();
    assert.equal(double.optionGroups[0].options.length, 3);
    assert.notEqual(double.optionGroups[0].id, template.group.id);
    await page.keyboard.press('Escape');
    await page.getByTestId('managed-' + double._id).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Use Saved Group', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Burger Vegetables — Already added', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('managed-' + burger._id).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByTestId('option-group-editor').first().locator('input[value="Pickles"]')).toHaveCount(3);
    await page.keyboard.press('Escape'); await page.getByRole('link', { name: 'Saved Option Groups', exact: true }).click();
    await page.getByTestId('template-' + template._id).getByRole('button', { name: 'Edit Template', exact: true }).click();
    await expect(page.locator('input[value="Pickles"]')).toHaveCount(3);
    await page.keyboard.press('Escape');
    for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
      await staff.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: messages.Templates.title, exact: true })).toBeVisible();
      for (const width of [320, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await page.screenshot({ path: 'test-artifacts/option-templates-' + locale + '.png', fullPage: true });
    }
    await menu.goto(base + '/r/salt?table=7'); await enterTableFixture(menu); await menu.getByRole('button', { name: 'English', exact: true }).click();
    await menu.getByRole('button', { name: 'Add Double Burger', exact: true }).first().click();
    await expect(menu.getByRole('checkbox', { name: 'Lettuce', exact: true })).toBeChecked();
    await expect(menu.getByRole('checkbox', { name: 'Pickles', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('checkbox', { name: 'Tomato', exact: true })).toBeChecked();
    await menu.screenshot({ path: 'test-artifacts/template-product-customer.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: save existing Burger Vegetables, copy to Double Burger, duplicate prevention after reopen, independent removal, original/template preservation, customer options and AR/HE RTL responsive templates.');
  } finally { await Product.updateOne({ _id: burger._id }, { $set: { optionGroups: previous } }); await browser.close(); }
}
