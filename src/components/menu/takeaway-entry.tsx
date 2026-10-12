'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { takeawayIdentity } from '@/lib/validators/takeaway';
import { takeawayApiPath } from '@/lib/customer-path';
import { MenuBrowser, type MenuBrowserProps } from './menu-browser';
export function TakeawayEntry(props: MenuBrowserProps) {
  const t = useTranslations('Takeaway'); const [visit, setVisit] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const sending = useRef(false); const [error, setError] = useState<'invalid' | 'failed' | null>(null);
  const path = `${takeawayApiPath(props.restaurant.slug)}/session`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(path, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async response => { if (response.ok) setVisit((await response.json()).visitId); else if (![401, 409].includes(response.status)) setError('failed'); }).catch(() => { if (!controller.signal.aborted) setError('failed'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return;
    const parsed = takeawayIdentity.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setError('invalid'); return; }
    sending.current = true; setBusy(true); setError(null);
    try { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(); setVisit((await response.json()).visitId); } catch { setError('failed'); } finally { sending.current = false; setBusy(false); }
  }
  if (loading) return <p role="status" className="py-8">{t('loading')}</p>;
  if (visit) return <><p data-testid="takeaway-mode" className="mt-6 rounded-xl bg-amber-50 p-4 text-lg font-bold">{t('title')}</p><MenuBrowser {...props} takeawayVisitId={visit} /></>;
  return <section className="mx-auto my-8 max-w-lg rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">{t('title')}</h2><p className="my-4">{t('hint')}</p><form onSubmit={submit} aria-busy={busy} className="space-y-5"><label className="block">{t('name')}<input name="customerName" autoComplete="name" required minLength={2} maxLength={100} disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border px-4" /></label><label className="block">{t('phone')}<input name="customerPhone" type="tel" dir="ltr" autoComplete="tel" required maxLength={32} disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border px-4" /></label>{error && <p role="alert" className="text-red-800">{t(error)}</p>}<button disabled={busy} className="min-h-12 rounded-full bg-emerald-950 px-6 font-bold text-white">{t(busy ? 'loading' : 'continue')}</button></form></section>;
}
