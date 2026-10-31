'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { customerApiPath } from '@/lib/customer-path';
import { tableAccessCode, type TableAccessState } from '@/lib/table-access';
import { MenuBrowser, type MenuBrowserProps } from './menu-browser';
import type { PublicTable } from '@/types/menu';

async function readEntry(path: string, signal: AbortSignal): Promise<TableAccessState> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Unavailable');
  const state = await response.json() as TableAccessState;
  if (state.mode !== 'OPEN') return state;
  const joined = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'OPEN', sessionId: state.sessionId }), signal });
  if (joined.ok) {
    const result = await joined.json() as { visitId: string };
    return { mode: 'AUTHORIZED', visitId: result.visitId };
  }
  // Reconcile a policy/session change without trusting stale browser state.
  if (joined.status === 403 || joined.status === 409) {
    const fresh = await fetch(path, { cache: 'no-store', signal });
    if (fresh.ok) {
      const next = await fresh.json() as TableAccessState;
      if (next.mode !== 'OPEN') return next;
    }
  }
  throw new Error('Unavailable');
}

export function TableAccessEntry(props: Omit<MenuBrowserProps, 'table'> & { table: PublicTable }) {
  const t = useTranslations('TableAccess');
  const [state, setState] = useState<TableAccessState | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const path = `${customerApiPath(props.restaurant.slug, props.table.tableNumber)}/session`;
  useEffect(() => {
    const controller = new AbortController();
    void readEntry(path, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])).then(setState)
      .catch(() => { if (!controller.signal.aborted) setError('failed'); });
    return () => controller.abort();
  }, [path]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!state || state.mode === 'OPEN' || state.mode === 'AUTHORIZED' || state.mode === 'WAIT' || sending.current) return;
    if (!tableAccessCode.safeParse(code).success) { setError('invalid'); return; }
    sending.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: state.mode, code, ...('sessionId' in state ? { sessionId: state.sessionId } : {}) }), signal: AbortSignal.timeout(20000) });
      const body = await response.json() as { visitId?: string; error?: { code?: string } };
      if (response.ok && body.visitId) { setCode(''); setState({ mode: 'AUTHORIZED', visitId: body.visitId }); return; }
      const errors: Record<string, string> = { INVALID_REQUEST: 'invalid', TABLE_CODE_INCORRECT: 'incorrect', TABLE_CODE_LIMIT: 'limited', TABLE_SESSION_STARTED: 'started', TABLE_SESSION_CHANGED: 'changed', TABLE_CODE_REQUIRED: 'changed', TABLE_UNAVAILABLE: 'changed', SESSION_REQUIRED: 'changed', SESSION_CLOSED: 'changed' };
      setError(errors[body.error?.code ?? ''] ?? 'failed');
      if (response.status === 409 || body.error?.code === 'TABLE_CODE_REQUIRED') {
        setCode('');
        setState(await readEntry(path, AbortSignal.timeout(20000)));
      }
    } catch { setError('failed'); }
    finally { sending.current = false; setBusy(false); }
  }
  if (state?.mode === 'AUTHORIZED') return <MenuBrowser {...props} />;
  if (!state || state.mode === 'OPEN' || state.mode === 'WAIT') return <section className="mx-auto my-8 max-w-lg rounded-2xl border bg-white p-6"><p role="status">{t(state?.mode === 'WAIT' ? 'waiting' : error ? 'failed' : 'loading')}</p>{(error || state?.mode === 'WAIT') && <button type="button" className="mt-4 min-h-12 rounded-xl border px-5" onClick={() => window.location.reload()}>{t('retry')}</button>}</section>;
  const creating = state.mode !== 'JOIN';
  return <section data-testid="table-access-gate" data-mode={state.mode} className="mx-auto my-8 max-w-lg rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-bold">{t(creating ? 'createTitle' : 'joinTitle', { number: props.table.tableNumber })}</h2>
    <p className="mt-4 text-lg">{t(creating ? 'createHint' : 'joinHint')}</p>
    <p className="my-4 leading-7 text-stone-600">{t(creating ? 'shareHint' : 'askHint')}</p>
    <form onSubmit={submit} aria-busy={busy} className="space-y-5">
      <label className="block font-bold">{t('codeLabel')}<input data-testid="table-code-input" type="text" inputMode="numeric" autoComplete="off" dir="ltr" pattern="[0-9]{3}" minLength={3} maxLength={3} required value={code} onChange={event => setCode(event.target.value)} disabled={busy} className="mt-3 min-h-16 w-full rounded-xl border border-stone-300 p-4 text-center text-3xl tracking-[0.5em]" /></label>
      {error && <p role="alert" className="text-red-800">{t(error)}</p>}
      <button data-testid="table-code-submit" disabled={busy} className="min-h-14 w-full rounded-xl bg-emerald-950 px-6 font-bold text-white">{t(busy ? 'loading' : creating ? 'create' : 'join')}</button>
    </form>
  </section>;
}
