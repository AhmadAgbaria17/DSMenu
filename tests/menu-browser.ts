import { enterTableFixture } from './table-access-fixture';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { mockRealtime } from './realtime-transport';
import { Category, Product, Order } from '../src/models';
import { createStaffUser } from '../src/lib/staff-users';
import type { StaffFixture } from './staff-http';
export async function runMenuBrowserChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Menu Staff', email: 'menu-browser@salt.local', password: fixture.password, role: 'STAFF' });
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockRealtime(staff); await mockRealtime(customer);
  const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: '#73a66a' } }).png().toBuffer();
  for (const context of [staff, customer]) await context.route('https://res.cloudinary.com/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  const dashboard = await staff.newPage(); const menu = await customer.newPage();
  const errors: string[] = []; dashboard.on('pageerror', error => errors.push(error.message)); menu.on('pageerror', error => errors.push(error.message));
  try {
    await dashboard.goto(`${base}/login`); await dashboard.getByRole('button', { name: 'English', exact: true }).click();
    await dashboard.getByLabel('Email', { exact: true }).fill('menu-browser@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password);
    await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(`${base}/dashboard`);
    await dashboard.getByRole('link', { name: 'Categories', exact: true }).click(); await dashboard.getByRole('button', { name: 'Add category', exact: true }).click();
    await dashboard.getByLabel('Name (Arabic)', { exact: true }).fill('سلطات'); await dashboard.getByLabel('Name (Hebrew)', { exact: true }).fill('סלטים'); await dashboard.getByLabel('Name (English)', { exact: true }).fill('Salads');
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    await dashboard.getByLabel('Upload or replace image').setInputFiles({ name: 'salads.png', mimeType: 'image/png', buffer: png });
    await expect.poll(async () => !!(await Category.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Salads' }))?.image?.publicId).toBe(true);
    await dashboard.keyboard.press('Escape');
    await dashboard.getByRole('link', { name: 'Products', exact: true }).click(); await dashboard.getByRole('button', { name: 'Add product', exact: true }).click();
    await dashboard.getByLabel('Name (Arabic)', { exact: true }).fill('سلطة سيزر'); await dashboard.getByLabel('Name (Hebrew)', { exact: true }).fill('סלט קיסר'); await dashboard.getByLabel('Name (English)', { exact: true }).fill('Caesar Salad');
    const category = await Category.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Salads' }).orFail();
    await dashboard.getByLabel('Category', { exact: true }).selectOption(String(category._id)); await dashboard.getByLabel('Price (₪)', { exact: true }).fill('42.90');
    await dashboard.getByLabel('Featured', { exact: true }).check();
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    const product = await Product.findOne({ restaurantId: fixture.restaurantId, nameEn: 'Caesar Salad' }).orFail(); assert.equal(product.price, 4290);
    await dashboard.getByLabel('Upload or replace image').setInputFiles({ name: 'salad.png', mimeType: 'image/png', buffer: png });
    await expect.poll(async () => !!(await Product.findById(product._id))?.image?.publicId).toBe(true);
    await dashboard.screenshot({ path: 'test-artifacts/product-editor-en-tablet.png' });
    await dashboard.keyboard.press('Escape');
    await menu.goto(`${base}/r/salt?table=2`); await enterTableFixture(menu); await menu.getByRole('button', { name: 'English', exact: true }).click();
    await expect(menu.getByRole('heading', { name: 'Salads', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: 'Add Caesar Salad', exact: true }).first().click();
    await menu.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
    await menu.getByTestId('my-order-button').click();
    await menu.getByRole('button', { name: 'Edit note', exact: true }).click();
    await menu.getByRole('dialog').getByRole('textbox').fill('Dressing on the side');
    await menu.getByRole('button', { name: 'Save note', exact: true }).click();
    await menu.getByTestId('send-order').click(); await expect(menu.getByTestId('order-success')).toBeVisible();
    const ordered = await Order.findOne({ restaurantId: fixture.restaurantId, 'items.productId': product._id }).orFail(); assert.equal(ordered.items[0].price, 4290); assert.equal(ordered.items[0].notes, 'Dressing on the side');
    const row = dashboard.getByTestId(`managed-${product._id}`);
    await row.getByRole('button', { name: 'Available', exact: true }).click(); await expect(row.getByRole('button', { name: 'Unavailable', exact: true })).toBeVisible();
    await menu.reload(); await enterTableFixture(menu); await expect(menu.getByRole('button', { name: 'Add Caesar Salad', exact: true }).first()).toBeDisabled();
    await row.getByRole('button', { name: 'Edit', exact: true }).click(); await dashboard.getByLabel('Price (₪)', { exact: true }).fill('45.50');
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible(); await dashboard.keyboard.press('Escape');
    await menu.reload(); await enterTableFixture(menu); await expect(menu.locator(`[data-product-id="${product._id}"]`).first()).toContainText('45.50'); assert.equal((await Order.findById(ordered._id).orFail()).items[0].price, 4290);
    await dashboard.getByRole('link', { name: 'Restaurant Settings', exact: true }).click();
    await dashboard.getByLabel('Description', { exact: true }).fill('Fresh menu, made daily'); await dashboard.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dashboard.getByText('Saved successfully', { exact: true })).toBeVisible();
    for (const title of ['Restaurant logo', 'Cover image']) {
      const section = dashboard.locator('section').filter({ has: dashboard.getByRole('heading', { name: title, exact: true }) });
      await section.getByLabel('Upload or replace image').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: png }); await expect(section.getByText('Saved successfully', { exact: true })).toBeVisible();
    }
    await menu.reload(); await enterTableFixture(menu); await expect(menu.getByText('Fresh menu, made daily', { exact: true })).toBeVisible();
    await dashboard.getByRole('link', { name: 'Products', exact: true }).click();
    await dashboard.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(dashboard.locator('html')).toHaveAttribute('dir', 'rtl');
    await dashboard.getByTestId(`managed-${product._id}`).getByRole('button', { name: 'تعديل', exact: true }).click();
    await expect(dashboard.getByLabel('الاسم بالعربية', { exact: true })).toHaveAttribute('dir', 'rtl');
    await expect(dashboard.getByLabel('الاسم بالإنجليزية', { exact: true })).toHaveAttribute('dir', 'ltr');
    for (const width of [390, 768, 1280]) { await dashboard.setViewportSize({ width, height: 900 }); assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await dashboard.setViewportSize({ width: 390, height: 844 }); await dashboard.screenshot({ path: 'test-artifacts/product-editor-ar-mobile.png' });
    await dashboard.keyboard.press('Escape'); await dashboard.getByRole('button', { name: 'עברית', exact: true }).click(); await expect(dashboard.getByRole('heading', { name: 'מוצרים', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: menu staff/customer browser CRUD, three translations, mocked uploads, featured product, agorot checkout, availability, price refresh/history, logo/cover/settings and RTL forms.');
  } catch (error) { await dashboard.screenshot({ path: 'test-artifacts/menu-management-failure.png', fullPage: true }).catch(() => {}); throw error; }
  finally { await staff.close(); await customer.close(); await browser.close(); }
}
