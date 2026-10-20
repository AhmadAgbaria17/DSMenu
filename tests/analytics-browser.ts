import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mockRealtime } from './realtime-transport';
import type { AnalyticsFixture } from './analytics-http';
export async function runAnalyticsBrowserChecks(base: string, fixture: AnalyticsFixture) {
  const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, timezoneId: 'America/New_York' });
  await mockRealtime(context); const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error' && /hydration|did not match/i.test(message.text())) errors.push(message.text()); });
  try {
    await page.goto(`${base}/dashboard/analytics`); await expect(page).toHaveURL(`${base}/login`);
    await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('Email', { exact: true }).fill(fixture.email); await page.getByLabel('Password', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(`${base}/dashboard`);
    await expect(page.getByTestId('today-orders')).toHaveText('0'); await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page.getByTestId('analytics-orders')).toHaveText('0'); await expect(page.getByTestId('analytics-averageOrderValue')).toHaveText('Not enough data');
    await page.getByRole('link', { name: 'Yesterday', exact: true }).click();
    await expect(page.getByTestId('analytics-orders')).toHaveText('4'); await expect(page.getByTestId('analytics-completedValue')).toContainText('169.40'); await expect(page.getByTestId('analytics-averageOrderValue')).toContainText('42.35');
    await expect(page.getByTestId('analytics-product').first()).toContainText('Historical Burger'); await expect(page.getByTestId('analytics-product').first()).toContainText('3 units');
    await expect(page.getByTestId('analytics-prepareTime')).toHaveText('15 min'); await expect(page.getByTestId('analytics-serviceCalls')).toHaveText('3');
    await expect(page.getByTestId(`analytics-day-${fixture.date}`)).toContainText('169.40'); await expect(page.getByTestId('analytics-hour-0')).toContainText('4');
    assert.equal(await page.getByText('Current Expensive Burger', { exact: true }).count(), 0); assert.equal(await page.getByText('Classic Burger', { exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Last 7 Days', exact: true }).click(); await expect(page.getByTestId('analytics-orders')).toHaveText('5'); await expect(page.locator('[data-testid^="analytics-day-"]')).toHaveCount(7);
    await page.getByRole('link', { name: 'Last 30 Days', exact: true }).click(); await expect(page.locator('[data-testid^="analytics-day-"]')).toHaveCount(30);
    await page.screenshot({ path: 'test-artifacts/analytics-en-tablet.png', fullPage: true });
    await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.getByRole('heading', { name: 'التحليلات', exact: true })).toBeVisible();
    await expect(page.getByTestId('analytics-product').filter({ hasText: 'برغر تاريخي' })).toBeVisible();
    for (const width of [390, 768, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `analytics fits ${width}px`); }
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-artifacts/analytics-ar-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'עברית', exact: true }).click(); await expect(page.getByRole('heading', { name: 'נתונים וניתוח', exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    assert.deepEqual(errors, []);
    console.log('PASS: analytics protected browser flow, preset navigation, snapshot totals/products/timings, zero states, tenant separation, AR/HE/EN, RTL, responsive widths and foreign browser timezone.');
  } catch (error) { await page.screenshot({ path: 'test-artifacts/analytics-failure.png', fullPage: true }).catch(() => {}); throw error; }
  finally { await context.close(); await browser.close(); }
}
