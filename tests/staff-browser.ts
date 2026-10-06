import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mockRealtime } from './realtime-transport';
import { Table, User } from '../src/models';
import type { StaffFixture } from './staff-http';

export async function runStaffBrowserChecks(base: string, fixture: StaffFixture) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await mockRealtime(context);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) errors.push(message.text()); });
  async function login(password = fixture.password) {
    await page.getByLabel('Email', { exact: true }).fill(fixture.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
  }
  try {
    await page.goto(`${base}/dashboard`);
    await expect(page).toHaveURL(`${base}/login`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.screenshot({ path: 'test-artifacts/login-ar-tablet.png' });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await login('incorrect-password');
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();
    await login();
    await expect(page).toHaveURL(`${base}/dashboard`);
    await expect(page.getByTestId('dashboard-restaurant')).toHaveText('Salt');
    await expect(page.getByTestId('metric-activeTables')).toHaveText(String(await Table.countDocuments({ restaurantId: fixture.restaurantId, isActive: true })));
    await page.screenshot({ path: 'test-artifacts/dashboard-en-tablet.png' });
    await page.getByRole('link', { name: 'Products', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add product', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Tables', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tables', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Table', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'עברית', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'סקירה כללית', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'עברית', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'עברית', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'test-artifacts/dashboard-he-tablet.png' });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `staff UI fits ${width}px`);
    }
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const cookies = await context.cookies();
    const credential = cookies.find(cookie => cookie.name.includes('authjs.session-token'));
    assert.ok(credential?.httpOnly); assert.ok(credential?.secure);
    assert.equal((await page.evaluate(() => document.cookie)).includes(credential.value), false);
    assert.equal((await page.evaluate(() => JSON.stringify(localStorage))).includes(credential.value), false);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(`${base}/login`);
    await page.goto(`${base}/dashboard/tables`);
    await expect(page).toHaveURL(`${base}/login`);
    await login();
    await expect(page).toHaveURL(`${base}/dashboard`);
    await User.updateOne({ _id: fixture.userId }, { $set: { isActive: false } });
    await page.reload();
    await expect(page).toHaveURL(`${base}/login`);
    assert.deepEqual(errors, []);
    console.log('PASS: browser staff login/logout, protected navigation, tenant overview, AR/HE/EN, RTL, tablet/mobile layouts, HttpOnly cookies and inactive-user rejection.');
  } catch (error) {
    await page.screenshot({ path: 'test-artifacts/staff-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await User.updateOne({ _id: fixture.userId }, { $set: { isActive: true } });
    await context.close(); await browser.close();
  }
}
