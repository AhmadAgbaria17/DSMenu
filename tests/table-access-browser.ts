import assert from 'node:assert/strict';
import { chromium, expect, type Page } from '@playwright/test';
import { Order, ServiceCall, Table, TableSession } from '../src/models';
import { createStaffUser } from '../src/lib/staff-users';
import { AuthClient, type StaffFixture } from './staff-http';
import { mockRealtime } from './realtime-transport';
import ar from '../src/i18n/messages/ar.json';
import he from '../src/i18n/messages/he.json';
import en from '../src/i18n/messages/en.json';

export async function runTableAccessBrowserChecks(base: string, fixture: StaffFixture) {
  await createStaffUser({ restaurant: 'salt', name: 'Access Staff', email: 'access@salt.local', password: fixture.password, role: 'STAFF' });
  const api = new AuthClient(base); await api.login('access@salt.local', fixture.password);
  const table = await Table.findOne({ restaurantId: fixture.restaurantId, tableNumber: 7 }).orFail();
  const prior = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' });
  if (prior) {
    // Finish preceding suites' fixtures before the independent reset scenario.
    await Order.updateMany({ tableSessionId: prior._id }, { $set: { status: 'READY' } });
    await ServiceCall.updateMany({ tableSessionId: prior._id }, { $set: { status: 'RESOLVED' } });
    assert.equal((await api.request(`/api/dashboard/tables/${table._id}/close`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: String(prior._id) }) })).status, 200);
  }
  const browser = await chromium.launch();
  const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const second = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const third = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const staff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const context of [first, second, third, fresh, staff]) { await mockRealtime(context); await context.addCookies([{ name: 'dsmenu-language', value: 'en', url: base }]); }
  const a = await first.newPage(); const b = await second.newPage(); const dashboard = await staff.newPage(); const c = await third.newPage(); const next = await fresh.newPage();
  const submit = async (page: Page, code: string) => { await page.getByTestId('table-code-input').fill(code); await page.getByTestId('table-code-submit').click(); };
  try {
    await dashboard.goto(base + '/login'); await dashboard.getByLabel('Email', { exact: true }).fill('access@salt.local'); await dashboard.getByLabel('Password', { exact: true }).fill(fixture.password); await dashboard.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(dashboard).toHaveURL(base + '/dashboard');
    await a.goto(base + '/r/salt?table=7');
    await expect(a.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE');
    await expect(a.getByRole('heading', { name: 'Start Table 7', exact: true })).toBeVisible();
    await expect(a.getByTestId('my-order-button')).toHaveCount(0);
    for (const [locale, messages] of [['ar', ar], ['he', he], ['en', en]] as const) {
      await first.addCookies([{ name: 'dsmenu-language', value: locale, url: base }]); await a.reload();
      await expect(a.getByText(messages.TableAccess.createHint, { exact: true })).toBeVisible();
      await expect(a.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
      assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await a.screenshot({ path: `test-artifacts/table-code-${locale}.png`, fullPage: true });
    }
    await submit(a, '527'); await expect(a.getByTestId('my-order-button')).toBeEnabled();
    const sessionA = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).orFail();
    await b.goto(base + '/r/salt?table=7'); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN');
    await expect(b.getByTestId('my-order-button')).toHaveCount(0);
    await submit(b, '123'); await expect(b.getByTestId('table-access-gate').getByRole('alert')).toContainText(en.TableAccess.incorrect);
    await submit(b, '527'); await expect(b.getByTestId('my-order-button')).toBeEnabled();
    assert.equal((await (await second.request.get(base + '/api/r/salt/tables/7/session')).json()).visitId, String(sessionA._id));
    await a.reload(); await expect(a.getByTestId('my-order-button')).toBeEnabled(); await expect(a.getByTestId('table-access-gate')).toHaveCount(0);
    await c.goto(base + '/r/salt?table=7'); await expect(c.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN');
    await submit(c, '527'); await expect(c.getByTestId('my-order-button')).toBeEnabled();
    for (const [page, name] of [[a, 'Classic Burger'], [b, 'Cola'], [c, 'Cola']] as const) {
      await page.getByRole('button', { name: `Add ${name}`, exact: true }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: /Add to My Order/ }).click();
      await page.getByTestId('my-order-button').click(); await page.getByTestId('send-order').click();
      await expect(page.getByTestId('order-success')).toBeVisible(); await page.keyboard.press('Escape');
    }
    assert.equal(await Order.countDocuments({ tableSessionId: sessionA._id }), 3, 'all three devices order into the same visit');
    await dashboard.goto(base + '/dashboard/orders');
    const group = dashboard.getByTestId(`order-group-${sessionA._id}`).getByTestId('preparation-card');
    await group.getByRole('button', { name: 'Start preparing all', exact: true }).click();
    await group.getByRole('button', { name: 'Mark all ready', exact: true }).click();
    await expect.poll(() => Order.countDocuments({ tableSessionId: sessionA._id, status: 'READY' })).toBe(3);
    await dashboard.goto(base + '/dashboard/tables'); const row = dashboard.getByRole('main').getByTestId('table-7');
    await expect(row.getByTestId('table-access-code')).toBeVisible();
    await expect(row.getByTestId('table-access-code')).toHaveText('527');
    await row.getByRole('button', { name: 'Close Session', exact: true }).click(); await dashboard.getByTestId('bill-close').click(); await expect(row).toContainText('Available');
    await expect(row.getByTestId('table-access-code')).toHaveCount(0);
    assert.equal((await second.request.get(base + '/api/r/salt/tables/7/orders')).status(), 409);
    assert.equal((await second.request.post(base + '/api/r/salt/tables/7/session', { headers: { Origin: base }, data: { action: 'JOIN', code: '527', sessionId: String(sessionA._id) } })).status(), 409);
    await a.reload(); await expect(a.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE');
    await expect(a.getByText('Choose a new 3-digit code.', { exact: true })).toBeVisible(); await expect(a.getByTestId('table-code-input')).toHaveValue('');
    for (const context of [first, second, third]) {
      const blocked = await context.request.post(base + '/api/r/salt/tables/7/orders', { headers: { Origin: base }, data: { clientRequestId: crypto.randomUUID(), items: [{ productId: '123456789012345678901234', quantity: 1, note: '' }] } });
      assert.equal(blocked.status(), 409, 'closed credentials cannot submit orders');
    }
    await next.goto(base + '/r/salt?table=7'); await expect(next.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE');
    await submit(next, '314'); await expect(next.getByTestId('my-order-button')).toBeEnabled();
    const sessionB = await TableSession.findOne({ tableId: table._id, status: 'ACTIVE' }).select('+accessCode').orFail();
    assert.notEqual(String(sessionB._id), String(sessionA._id)); assert.equal(sessionB.accessCode, '314');
    await b.reload(); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN');
    await submit(b, '527'); await expect(b.getByTestId('table-access-gate').getByRole('alert')).toContainText(en.TableAccess.incorrect); await expect(b.getByTestId('my-order-button')).toHaveCount(0);
    await submit(b, '314'); await expect(b.getByTestId('my-order-button')).toBeEnabled();
    await dashboard.reload(); await expect(row.getByTestId('table-access-code')).toHaveText('314'); await expect(row).not.toContainText('527');
    assert.equal((await TableSession.findById(sessionA._id).select('+accessCode').lean())?.accessCode, undefined);
    assert.equal(new URL(a.url()).search, '?table=7');
    await expect(row.getByTestId('table-access-code')).toBeVisible(); await row.scrollIntoViewIfNeeded();
    await dashboard.screenshot({ path: 'test-artifacts/table-code-reset-314.png' });
    assert.equal(await Order.countDocuments({ tableSessionId: sessionA._id }), 3, 'closing preserves order history');
    await Table.create({ restaurantId: fixture.restaurantId, tableNumber: 411 });
    for (const page of [a, b]) { await page.goto(base + '/r/salt?table=411'); await expect(page.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'CREATE'); }
    await submit(a, '027'); await expect(a.getByTestId('my-order-button')).toBeEnabled();
    await submit(b, '999'); await expect(b.getByTestId('table-access-gate')).toHaveAttribute('data-mode', 'JOIN');
    await expect(b.getByTestId('table-access-gate').getByRole('alert')).toContainText(en.TableAccess.started);
    await submit(b, '027'); await expect(b.getByTestId('my-order-button')).toBeEnabled();
    console.log('PASS: Table 7 three-device 527 join/orders, staff close, old code/credentials rejected, CREATE prompt, fresh-browser 314 create/join, 527 rejected, staff displays only 314; AR/HE/EN and RTL.');
  } finally { await browser.close(); }
}
