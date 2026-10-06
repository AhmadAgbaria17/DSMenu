'use client';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useActivity } from './activity-provider';
import type { StaffServiceCall, ServiceStatus } from '@/types/service-calls';
export function ServiceCalls() {
  const { snapshot, refresh, connection, error } = useActivity();
  const t = useTranslations('Service');
  const live = useTranslations('LiveOrders');
  const menu = useTranslations('Menu');
  const locale = useLocale();
  const router = useRouter();
  const [history, setHistory] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [failure, setFailure] = useState<'failed' | 'conflict' | null>(null);
  async function update(call: StaffServiceCall, status: ServiceStatus) {
    if (sending.current) return;
    sending.current = true; setPending(true); setFailure(null);
    try {
      const response = await fetch(`/api/dashboard/service-calls/${call.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: call.status, status }), signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { router.replace('/login'); router.refresh(); }
      if (!response.ok) setFailure(response.status === 409 ? 'conflict' : 'failed');
    } catch { setFailure('failed'); }
    finally { await refresh(true); sending.current = false; setPending(false); }
  }
  const visible = snapshot.calls.filter(call => history ? call.status === 'RESOLVED' : call.status !== 'RESOLVED');
  const groups = new Map<string, StaffServiceCall[]>();
  visible.forEach(call => groups.set(call.tableSessionId, [...(groups.get(call.tableSessionId) ?? []), call]));
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
  return <>
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-bold">{t('title')}</h1><p role="status" className="mt-3 text-sm text-stone-600">{live(`connection.${connection}`)}</p></div><button type="button" onClick={() => void refresh(true)} className="min-h-12 rounded-full border bg-white px-5 font-bold">{t('refresh')}</button></div>
    <div className="my-7 flex gap-3">{[false, true].map(value => <button key={String(value)} type="button" aria-pressed={history === value} onClick={() => setHistory(value)} className={`min-h-12 rounded-full px-6 font-bold ${history === value ? 'bg-emerald-950 text-white' : 'border bg-white'}`}>{t(value ? 'history' : 'active')}</button>)}</div>
    {(error || failure) && <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-4">{live(failure ?? 'failed')}</p>}
    {history && <p className="mb-4 text-sm text-stone-500">{t('historyHint')}</p>}
    {!visible.length && <p className="rounded-2xl border border-dashed bg-white p-10 text-center">{t('empty')}</p>}
    <div className="space-y-8">{[...groups].map(([visit, calls]) => <section key={visit}><h2 className="mb-4 text-2xl font-bold">{calls[0].tableNumber === null ? live('unknownTable') : menu('table', { number: calls[0].tableNumber })}<span className="ms-3 text-sm font-normal text-stone-500">{live('visit', { id: visit.slice(-6) })}</span></h2><div className="grid gap-4 xl:grid-cols-2">{calls.map(call => <article key={call.id} data-testid={`service-call-${call.id}`} className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-bold">{t(`requested.${call.type}`)}</h3><p className="my-4 font-bold text-amber-900">{t(`status.${call.status}`)}</p><dl className="space-y-2 text-sm text-stone-600"><div><dt className="inline">{t('requestedAt')}: </dt><dd className="inline"><time dateTime={call.createdAt}>{time(call.createdAt)}</time></dd></div>{call.acknowledgedAt && <div><dt className="inline">{t('status.ACKNOWLEDGED')}: </dt><dd className="inline">{time(call.acknowledgedAt)}</dd></div>}{call.resolvedAt && <div><dt className="inline">{t('status.RESOLVED')}: </dt><dd className="inline">{time(call.resolvedAt)}</dd></div>}</dl><div className="mt-5 flex flex-wrap gap-3">{call.status === 'PENDING' && <button type="button" disabled={pending} onClick={() => void update(call, 'ACKNOWLEDGED')} className="min-h-14 rounded-xl bg-amber-100 px-6 font-bold disabled:opacity-50">{t('acknowledge')}</button>}{call.status !== 'RESOLVED' && <button type="button" disabled={pending} onClick={() => void update(call, 'RESOLVED')} className="min-h-14 rounded-xl bg-emerald-950 px-6 font-bold text-white disabled:opacity-50">{t('resolve')}</button>}</div></article>)}</div></section>)}</div>
  </>;
}
