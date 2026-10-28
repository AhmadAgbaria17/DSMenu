import assert from 'node:assert/strict';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { KitchenPrintState } from '../src/models';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

export async function checkGroupedKitchenPrinting(dashboard: Page, group: Locator, base: string, batchId: string) {
  const context = dashboard.context();
  await context.addInitScript(() => { window.print = () => { const w = window as Window & { printCalls?: number }; w.printCalls = (w.printCalls ?? 0) + 1; }; });
  await expect(group.getByRole('link', { name: 'Print Kitchen Ticket', exact: true })).toHaveCount(1);
  const open = async (label: string) => {
    const created = context.waitForEvent('page');
    await group.getByRole('link', { name: label, exact: true }).click();
    const page = await created; await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('kitchen-ticket')).toBeVisible();
    return page;
  };
  const preview = await open('Print Kitchen Ticket');
  try {
    await expect(preview.getByTestId('ticket-order')).toHaveCount(2);
    const ticket = preview.getByTestId('kitchen-ticket');
    await expect(ticket).toContainText('TABLE 7');
    await expect(ticket).toContainText('#1 + #2');
    await expect(ticket).toContainText('Customer A: no mayo'); await expect(ticket).toContainText('Customer B');
    await expect(ticket).not.toContainText('extra toasted');
    await expect(ticket).not.toContainText('₪');
    assert.equal(await KitchenPrintState.countDocuments({ unitId: batchId }), 0, 'opening preview alone never increments counts');
    await preview.getByRole('button', { name: 'Print Kitchen Ticket', exact: true }).click();
    await expect.poll(() => preview.evaluate(() => (window as Window & { printCalls?: number }).printCalls)).toBe(1);
    await dashboard.bringToFront();
    await expect(group.getByRole('status')).toHaveText('✓ Printed');
    await expect(group.getByRole('link', { name: 'Reprint Kitchen Ticket', exact: true })).toBeVisible();
    const again = await open('Reprint Kitchen Ticket');
    try {
      await again.getByRole('button', { name: 'Reprint Kitchen Ticket', exact: true }).click();
      await expect.poll(() => again.evaluate(() => (window as Window & { printCalls?: number }).printCalls)).toBe(1);
      await dashboard.bringToFront(); await expect(group.getByRole('status')).toHaveText('✓ Printed ×2');
      assert.equal((await KitchenPrintState.findOne({ unitId: batchId }).orFail()).kitchenPrintCount, 2);
    } finally { await again.close(); }
    const settings = await context.newPage();
    try {
      async function toggle(enabled: boolean) {
        await settings.goto(base + '/dashboard/settings');
        await settings.getByLabel(en.Kitchen.enablePrinting, { exact: true }).setChecked(enabled);
        await settings.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(settings.getByText('Saved successfully', { exact: true })).toBeVisible();
      }
      await toggle(false);
      await dashboard.reload();
      await expect(group.getByTestId('kitchen-print-action')).toHaveCount(0);
      await expect(group.getByRole('status')).toHaveCount(0);
      await expect(group.getByRole('button', { name: en.LiveOrders.readyGroup, exact: true })).toBeEnabled();
      // An already-open preview must also be denied when it attempts to print.
      await preview.getByRole('button', { name: 'Reprint Kitchen Ticket', exact: true }).click();
      await expect(preview.getByRole('main').getByRole('alert')).toHaveText(en.Kitchen.disabled);
      assert.equal(await preview.evaluate(() => (window as Window & { printCalls?: number }).printCalls), 1);
      await preview.reload();
      await expect(preview.getByRole('heading', { name: en.Kitchen.disabled, exact: true })).toBeVisible();
      await expect(preview.getByTestId('kitchen-ticket')).toHaveCount(0);
      for (const [locale, messages] of [['ar', ar], ['he', he], ['en', en]] as const) {
        await context.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]);
        await settings.reload();
        await expect(settings.getByRole('heading', { name: messages.Kitchen.settingsTitle, exact: true })).toBeVisible();
        await expect(settings.getByLabel(messages.Kitchen.enablePrinting, { exact: true })).not.toBeChecked();
        await expect(settings.getByText(messages.Kitchen.settingsHint, { exact: true })).toBeVisible();
        await expect(settings.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
        await preview.reload(); await expect(preview.getByRole('heading', { name: messages.Kitchen.disabled, exact: true })).toBeVisible();
      }
      await toggle(true); await dashboard.reload();
      await expect(group.getByRole('link', { name: 'Reprint Kitchen Ticket', exact: true })).toBeVisible();
      await expect(group.getByRole('status')).toHaveText('✓ Printed ×2');
      assert.equal((await KitchenPrintState.findOne({ unitId: batchId }).orFail()).kitchenPrintCount, 2);
    } finally { await settings.close(); }
    for (const locale of ['en', 'ar', 'he']) {
      await context.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await preview.reload();
      await expect(preview.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      const label = locale === 'ar' ? ar.Kitchen.paperWidth : locale === 'he' ? he.Kitchen.paperWidth : 'Paper width';
      for (const width of ['80', '58']) {
        await preview.emulateMedia({ media: 'screen' });
        await preview.getByLabel(label, { exact: true }).selectOption(width);
        await preview.emulateMedia({ media: 'print' });
        await expect(preview.locator('.kitchen-print-controls')).toBeHidden();
        assert.equal(await preview.locator('aside, nav, img').count(), 0, 'standalone ticket excludes app chrome/images');
        const geometry = await ticket.evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth + 1, descendantsOverflow: Array.from(element.querySelectorAll('section, p, h1, h2, h3, h4, li')).some(el => el.scrollWidth > el.clientWidth + 1) }));
        assert.ok(Math.abs(geometry.width - (width === '80' ? 74 : 52) * 96 / 25.4) < 1);
        assert.equal(geometry.overflow, false); assert.equal(geometry.descendantsOverflow, false);
        assert.ok(await preview.evaluate(() => Array.from(document.styleSheets).some(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.startsWith('@page') && rule.cssText.includes('margin: 3mm')))));
        await ticket.screenshot({ path: `test-artifacts/kitchen-${locale}-${width}mm.png` });
        await preview.pdf({ path: `test-artifacts/kitchen-${locale}-${width}mm.pdf`, width: `${width}mm`, height: '297mm', displayHeaderFooter: false, printBackground: false, preferCSSPageSize: true });
      }
    }
    assert.equal((await KitchenPrintState.findOne({ unitId: batchId }).orFail()).kitchenPrintCount, 2, 'layout previews and PDF checks do not trigger application print counters');
  } finally {
    await preview.close(); await context.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); await dashboard.reload();
  }
}

export async function runKitchenTakeawayBrowserChecks(base: string, password: string, orderId: string) {
  const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(base + '/login'); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('kitchen@salt.local'); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(base + '/dashboard');
    await page.goto(`${base}/print/kitchen/order/${orderId}`);
    const ticket = page.getByTestId('kitchen-ticket');
    for (const text of ['TAKE AWAY', 'Kitchen Pickup', 'Snapshot Burger', 'REMOVE:', 'Tomato', 'Onion', 'Extra Cheese', 'Spicy', 'NO MAYO', 'Allergy: sesame', 'Kitchen order note']) await expect(ticket).toContainText(text);
    await expect(ticket).not.toContainText('0501234567'); await expect(ticket).not.toContainText('₪');
    for (const width of ['80', '58']) {
      await page.getByLabel('Paper width', { exact: true }).selectOption(width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await ticket.screenshot({ path: `test-artifacts/kitchen-takeaway-options-${width}mm.png` });
    }
    const settings = await context.newPage();
    try {
      await settings.goto(base + '/dashboard/settings');
      await settings.getByLabel(en.Kitchen.enablePrinting, { exact: true }).uncheck();
      await settings.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(settings.getByText('Saved successfully', { exact: true })).toBeVisible();
      await page.goto(base + '/dashboard/orders');
      const card = page.getByTestId(`staff-order-${orderId}`);
      await expect(card.getByTestId('kitchen-print-action')).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Mark ready', exact: true })).toBeEnabled();
      await page.goto(`${base}/print/kitchen/order/${orderId}`);
      await expect(page.getByRole('heading', { name: en.Kitchen.disabled, exact: true })).toBeVisible();
      await expect(page.getByTestId('kitchen-ticket')).toHaveCount(0);
      await settings.getByLabel(en.Kitchen.enablePrinting, { exact: true }).check();
      await settings.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(settings.getByText('Saved successfully', { exact: true })).toBeVisible();
      await page.goto(base + '/dashboard/orders');
      await expect(card.getByRole('link', { name: en.Kitchen.reprint, exact: true })).toBeVisible();
      assert.equal((await KitchenPrintState.findOne({ unitId: orderId }).orFail()).kitchenPrintCount, 1);
    } finally { await settings.close(); }
    console.log('PASS: grouped/takeaway print toggles, persistent metadata, disabled direct/stale previews, localized settings AR/HE/EN, notes/options and measured 80/58mm print/PDF layouts.');
  } finally { await browser.close(); }
}
