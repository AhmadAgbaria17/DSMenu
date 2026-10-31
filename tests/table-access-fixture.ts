import { expect, type Page } from '@playwright/test';
import type { TableAccessState } from '../src/lib/table-access';

export const fixtureTableCode = '027';

// Existing business-flow fixtures explicitly create/join with a known code.
// Security tests use native fetch and exercise every rejected request directly.
export const tableAccessFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (init?.method !== 'POST' || init.body !== '{}' || url.search || !/^\/api\/r\/[^/]+\/tables\/[1-9][0-9]*\/session$/.test(url.pathname) || new Headers(init.headers).get('Origin') !== url.origin) return fetch(input, init);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(input, { headers: init.headers });
    if (!response.ok) return fetch(input, init);
    const state = await response.json() as TableAccessState;
    if (state.mode === 'AUTHORIZED' || state.mode === 'WAIT') return fetch(input, init);
    const result = await fetch(input, { ...init, body: JSON.stringify({ action: state.mode, ...(state.mode === 'OPEN' ? {} : { code: fixtureTableCode }), ...('sessionId' in state ? { sessionId: state.sessionId } : {}) }) });
    if (result.status !== 409) return result;
  }
  throw new Error('Table fixture could not join the current visit');
};

// Use the real visible form, including after a closed visit is reopened.
export async function enterTableFixture(page: Page) {
  const url = new URL(page.url());
  const slug = /^\/r\/([^/]+)$/.exec(url.pathname)?.[1];
  const table = url.searchParams.get('table');
  if (!slug || !table) return;
  const response = await page.request.get(`${url.origin}/api/r/${slug}/tables/${table}/session`);
  if (!response.ok()) return; // Existing invalid-table tests keep their assertions.
  const state = await response.json() as TableAccessState;
  if (state.mode === 'AUTHORIZED') return;
  if (state.mode === 'OPEN') { await expect(page.getByTestId('my-order-button')).toBeEnabled(); return; }
  await expect(page.getByTestId('table-access-gate')).toBeVisible();
  await page.getByTestId('table-code-input').fill(fixtureTableCode);
  await page.getByTestId('table-code-submit').click();
  await expect(page.getByTestId('table-access-gate')).toHaveCount(0);
}
