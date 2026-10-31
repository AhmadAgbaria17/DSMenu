import assert from 'node:assert/strict';
import { chromium, expect, type Page } from '@playwright/test';
import { Restaurant, Table, TableSession, Order, ServiceCall } from '../src/models';
import { AuthClient, type StaffFixture } from './staff-http';
import { mockRealtime } from './realtime-transport';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

export async function runTableAccessSettingBrowserChecks(base: string, fixture: StaffFixture) {
  const api = new AuthClient(base); await api.login('access-setting@salt.local', fixture.password);
  for (const number of [7, 8, 9]) {
    const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: number }).orFail();
    const visit = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' });
    if (visit) {
      await Order.updateMany({ tableSessionId: visit._id }, { $set: { status: 'READY' } });
      await ServiceCall.updateMany({ tableSessionId: visit._id }, { $set: { status: 'RESOLVED' } });
      assert.equal((await api.request(`/api/dashboard/tables/${table._id}/close`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: String(visit._id) }) })).status, 200);
    }
  }
  const browser = await chromium.launch();
  const staff = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const second = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  for (const context of [staff, first, second]) { await mockRealtime(context); await context.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); }
  const dashboard = await staff.newPage(); const settings = await staff.newPage(); const a = await first.newPage(); const b = await second.newPage();
  const enter = async (page: Page, code: string) => { await page.getByTestId('table-code-input').fill(code); await page.getByTestId('table-code-submit').click(); await expect(page.getByTestId('my-order-button')).toBeEnabled(); };
  const toggle = async (enabled: boolean) => {
    await settings.goto(base + '/dashboard/settings'); await settings.getByRole('checkbox', { name: en.TableAccess.enableCode }).setChecked(enabled);
    await settings.getByRole('button', { name: 'Save', exact: true }).click(); await expect(settings.getByText('Saved successfully', { exact: true })).toBeVisible();
    await settings.reload(); await expect(settings.getByRole('checkbox', { name: en.TableAccess.enableCode })).toBeChecked({ checked: enabled });
  };
  const close = async (number: number) => {
    await dashboard.goto(base + '/dashboard/tables'); const row = dashboard.getByRole('main').getByTestId(`table-${number}`);
    await row.getByRole('button', { name: 'Close Session', exact: true }).click(); await dashboard.getByTestId('bill-close').click(); await expect(row).toContainText('Available');
  };
  try {
    await dashboard.goto(base + '/login'); await dashboard.getByLabel('Email', { exact: true }).fill('access-setting@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password); await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(base + '/dashboard');
    await toggle(true);
    await a.goto(base + '/r/salt?table=7'); await expect(a.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE'); await enter(a, '527');
    await b.goto(base + '/r/salt?table=7'); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN'); await enter(b, '527');
    await dashboard.goto(base + '/dashboard/tables'); await expect(dashboard.getByRole('main').getByTestId('table-7').getByTestId('table-access-code')).toHaveText('527');
    await toggle(false); await second.clearCookies(); await second.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]);
    await b.reload(); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN'); await enter(b, '527');
    await close(7); await a.reload(); await expect(a.getByTestId('my-order-button')).toBeEnabled(); await expect(a.getByTestId('table-access-gate')).toHaveCount(0);
    for (const page of [a, b]) { await page.goto(base + '/r/salt?table=8'); await expect(page.getByTestId('my-order-button')).toBeEnabled(); await expect(page.getByTestId('table-access-gate')).toHaveCount(0); }
    const table8 = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 8 }).orFail();
    const visit8 = await TableSession.findOne({ tableId: table8._id, status: 'ACTIVE' }).select('+accessCode').orFail();
    assert.equal(visit8.accessCodeRequired, false); assert.equal(visit8.accessCode, undefined);
    await a.getByRole('button', { name: 'Add Cola', exact: true }).first().click(); await a.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click(); await a.getByTestId('my-order-button').click(); await a.getByTestId('send-order').click(); await expect(a.getByTestId('order-success')).toBeVisible();
    await b.getByRole('button', { name: 'Service', exact: true }).click(); await b.getByRole('button', { name: 'Call Waiter', exact: true }).click(); await expect(b.getByText('Request sent', { exact: true })).toBeVisible();
    assert.equal(await Order.countDocuments({ tableSessionId: visit8._id }), 1); assert.equal(await ServiceCall.countDocuments({ tableSessionId: visit8._id }), 1);
    await dashboard.reload(); await expect(dashboard.getByRole('main').getByTestId('table-8')).toContainText('Occupied'); await expect(dashboard.getByRole('main').getByTestId('table-8').getByTestId('table-access-code')).toHaveCount(0);
    await a.goto(base + '/r/salt?table=9'); await expect(a.getByTestId('my-order-button')).toBeEnabled();
    await toggle(true); await b.goto(base + '/r/salt?table=9'); await expect(b.getByTestId('my-order-button')).toBeEnabled(); await expect(b.getByTestId('table-access-gate')).toHaveCount(0);
    await close(9); await a.reload(); await expect(a.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE'); await enter(a, '314');
    await toggle(false); await b.reload(); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN');
    await close(9); await b.reload(); await expect(b.getByTestId('my-order-button')).toBeEnabled(); await expect(b.getByTestId('table-access-gate')).toHaveCount(0);
    for (const [locale, messages] of [['ar', ar], ['he', he], ['en', en]] as const) {
      await staff.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await settings.reload();
      await expect(settings.getByRole('heading', { name: messages.TableAccess.settingsTitle, exact: true })).toBeVisible();
      await expect(settings.getByRole('checkbox', { name: messages.TableAccess.enableCode })).not.toBeChecked();
      await expect(settings.getByText(messages.TableAccess.newVisitsHint, { exact: true })).toBeVisible();
      await expect(settings.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      for (const width of [390, 768, 1280]) { await settings.setViewportSize({ width, height: 900 }); assert.ok(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
      await settings.getByRole('checkbox', { name: messages.TableAccess.enableCode }).scrollIntoViewIfNeeded(); await settings.screenshot({ path: `test-artifacts/table-security-${locale}.png` });
    }
    await a.goto(base + '/r/salt'); await expect(a.locator('[data-product-id]').first()).toBeVisible(); await expect(a.getByTestId('table-access-gate')).toHaveCount(0);
    await a.goto(base + '/r/salt?mode=takeaway'); await expect(a.getByRole('button', { name: 'Continue to menu', exact: true })).toBeVisible(); await expect(a.getByTestId('table-access-gate')).toHaveCount(0);
    console.log('PASS: settings UI persistence, protected Table 7, direct Table 8 ordering/service, Table 9 OFF/ON snapshot lifecycle, hidden code, AR/HE/EN RTL/responsive, no-table and takeaway.');
  } finally { await Restaurant.updateOne({ _id: fixture.restaurantId }, { $set: { tableAccessCodeEnabled: true } }); await browser.close(); }
}
