import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { Restaurant, User } from '../src/models';
import { mockRealtime } from './realtime-transport';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';

export async function runPlatformBrowserChecks(base: string, fixture: { email: string; password: string }) {
  const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await mockRealtime(context); const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  async function login(email: string) { await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Log in', exact: true }).click(); }
  try {
    await page.goto(`${base}/admin`); await expect(page).toHaveURL(`${base}/login`);
    await page.getByRole('button', { name: 'English', exact: true }).click(); await login(fixture.email);
    await expect(page).toHaveURL(`${base}/admin`); await expect(page.getByTestId('admin-overview')).toBeVisible();
    await page.getByRole('link', { name: 'Create restaurant', exact: true }).click();
    await page.getByLabel('Restaurant name', { exact: true }).fill('Browser Salt Test'); await page.getByLabel('Slug', { exact: true }).fill('browser-salt-test');
    await page.getByLabel('Owner name', { exact: true }).fill('Browser Owner'); await page.getByLabel('Owner email', { exact: true }).fill('owner@browser-salt-test.local'); await page.getByLabel('Temporary password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Create', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Restaurant and owner created successfully');
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    const restaurant = await Restaurant.findOne({ slug: 'browser-salt-test' }).orFail(); const owner = await User.findOne({ restaurantId: restaurant._id }).orFail(); assert.equal(owner.role, 'OWNER');
    await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(`${base}/login`); await login(owner.email);
    await expect(page).toHaveURL(`${base}/dashboard`); await expect(page.getByTestId('dashboard-restaurant')).toHaveText('Browser Salt Test');
    await page.goto(`${base}/admin/restaurants/new`); await expect(page).toHaveURL(`${base}/dashboard`); await expect(page.getByTestId('admin-overview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(`${base}/login`); await login(fixture.email); await expect(page).toHaveURL(`${base}/admin`);
    await page.getByRole('link', { name: 'Restaurants', exact: true }).click();
    const card = page.getByTestId('admin-restaurant-browser-salt-test');
    page.once('dialog', dialog => dialog.accept()); await card.getByRole('button', { name: 'Deactivate', exact: true }).click(); await expect(card.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
    assert.equal((await Restaurant.findById(restaurant._id).orFail()).isActive, false);
    page.once('dialog', dialog => dialog.accept()); await card.getByRole('button', { name: 'Activate', exact: true }).click(); await expect(card.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-artifacts/admin-restaurants-en.png' });
    for (const [locale, messages] of [['ar', ar], ['he', he]] as const) {
      await context.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await page.goto(`${base}/admin/restaurants/new`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.getByRole('heading', { name: messages.Admin.createRestaurant, exact: true })).toBeVisible();
      for (const width of [320, 768, 1024]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await page.screenshot({ path: `test-artifacts/admin-create-${locale}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []); console.log('PASS: platform browser bootstrap login, creation, owner login/tenant dashboard, admin rejection, activation confirmation, AR/HE/EN and responsive RTL forms.');
  } catch (error) { await page.screenshot({ path: 'test-artifacts/admin-failure.png', fullPage: true }).catch(() => {}); throw error; }
  finally { await context.close(); await browser.close(); }
}
