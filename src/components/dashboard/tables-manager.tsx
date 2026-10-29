'use client';
import Link from 'next/link';
import { TableBill } from './table-bill';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/shared/sheet';
import { actionClass } from './menu-fields';
import type { TableSnapshot, ManagedTable } from '@/types/tables';

export function TablesManager({ initial }: { initial: TableSnapshot }) {
  const access = useTranslations('TableAccess'); const t = useTranslations('Tables'); const locale = useLocale();
  const [data, setData] = useState(initial); const [editing, setEditing] = useState<ManagedTable | 'new' | null>(null);
  const [closing, setClosing] = useState<ManagedTable | null>(null); const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(''); const busy = useRef(false);
  async function reload() {
    const response = await fetch('/api/dashboard/tables', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Unavailable');
    setData(await response.json() as TableSnapshot);
  }
  useEffect(() => {
    const refresh = () => { if (!busy.current) void reload().catch(() => setMessage('failed')); };
    const interval = setInterval(refresh, 30_000); window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, []);
  async function mutate(path: string, body: unknown, method: string) {
    if (busy.current) return; busy.current = true; setPending(true); setMessage('');
    try {
      const response = await fetch(`/api/dashboard/tables${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        const result = await response.json() as { error?: { code?: string } };
        const codes: Record<string, string> = { TABLE_EXISTS: 'duplicate', ACTIVE_VISIT: 'activeVisitError', ACTIVE_ORDERS: 'activeOrdersError', UNRESOLVED_CALLS: 'callsError', CONFLICT: 'conflict', INVALID_REQUEST: 'invalid' };
        setMessage(codes[result.error?.code ?? ''] ?? 'failed');
        await reload(); return;
      }
      await reload(); setEditing(null); setClosing(null); setMessage('saved');
    } catch { setMessage('failed'); } finally { busy.current = false; setPending(false); }
  }
  const feedback = message && <p role={(message === 'saved' || message === 'sessionClosed') ? 'status' : 'alert'} className="my-4 rounded-xl bg-amber-50 p-4">{t(message)}</p>;
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">{t('title')}</h1><div className="flex gap-3"><button className={actionClass} onClick={() => { setMessage(''); setEditing('new'); }}>{t('add')}</button><button className={actionClass} onClick={() => void reload().catch(() => setMessage('failed'))}>{t('refresh')}</button></div></div>
    <p className="mb-5 text-stone-600">{t('immutable')}</p>
    {!editing && !closing && feedback}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.tables.map(table => <article key={table.id} data-testid={`table-${table.tableNumber}`} className="rounded-2xl border bg-white p-5">
      <h2 className="text-2xl font-bold">{t('table', { number: table.tableNumber })}</h2><p>{table.label}</p><p className="my-3 font-bold">{t(table.state)}</p>
      {table.visit && <div className="space-y-2 rounded-xl bg-stone-50 p-3">{table.visit.accessCode && <p className="text-lg font-bold">{access('staffCode')}: <bdi data-testid="table-access-code" className="text-2xl tracking-widest">{table.visit.accessCode}</bdi></p>}<p>{t('activeVisit')}: <time dateTime={table.visit.openedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(table.visit.openedAt))}</time></p><p>{t('orders', { count: table.visit.activeOrders })}</p><p>{t('calls', { count: table.visit.unresolvedCalls })}</p></div>}
      <div className="mt-4 flex flex-wrap gap-2"><button className={actionClass} onClick={() => { setMessage(''); setEditing(table); }}>{t('edit')}</button>{table.isActive && <Link className={actionClass} href={`/dashboard/qr-codes#table-${table.tableNumber}`}>{t('qr')}</Link>}{table.visit && <button className={actionClass} onClick={() => { setMessage(''); setClosing(table); }}>{t('closeVisit')}</button>}</div>
    </article>)}</div>
    {!data.tables.length && <p>{t('empty')}</p>}
    {editing && <Sheet title={t(editing === 'new' ? 'add' : 'edit')} onClose={() => { if (!pending) setEditing(null); }}><form className="space-y-5 p-6" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      if (editing === 'new') void mutate('', { tableNumber: Number(form.get('number')), label: String(form.get('label')) }, 'POST');
      else void mutate(`/${editing.id}`, { label: String(form.get('label')), isActive: form.get('active') === 'on' }, 'PATCH');
    }}>
      {feedback}<label className="block">{t('number')}<input name="number" type="number" min={1} max={9999} required disabled={pending || editing !== 'new'} defaultValue={editing === 'new' ? '' : editing.tableNumber} className="mt-2 block min-h-12 w-full rounded-xl border p-3" /></label>
      <label className="block">{t('label')}<input name="label" maxLength={100} disabled={pending} defaultValue={editing === 'new' ? '' : editing.label} className="mt-2 block min-h-12 w-full rounded-xl border p-3" /></label>
      {editing !== 'new' && <label className="flex min-h-12 items-center gap-3"><input name="active" type="checkbox" disabled={pending} defaultChecked={editing.isActive} />{t('active')}</label>}
      <button disabled={pending} className={actionClass}>{t(pending ? 'saving' : 'save')}</button>
    </form></Sheet>}
    {closing?.visit && <TableBill key={closing.visit.id} tableId={closing.id} sessionId={closing.visit.id} onDismiss={() => setClosing(null)} onClosed={async () => { await reload(); setClosing(null); setMessage('sessionClosed'); }} />}
  </>;
}
