'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrders } from '@/components/orders/orders-provider';
import { Sheet } from '@/components/shared/sheet';
import { serviceTypes } from '@/types/domain';
import { SERVICE_COOLDOWN_MS } from '@/lib/service-flow';
import type { CustomerServiceSnapshot, ServiceType } from '@/types/service-calls';
const icons = { WAITER: '🔔', BILL: '💳', HELP: '?' };
export function ServiceActions() {
  const { ready, apiPath, serviceRevision, realtimeState } = useOrders();
  const t = useTranslations('Service');
  const live = useTranslations('LiveOrders');
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CustomerServiceSnapshot>({ calls: [] });
  const [pending, setPending] = useState<ServiceType | null>(null);
  const [message, setMessage] = useState<'sent' | 'alreadyPending' | 'cooldown' | 'failed' | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);
  const sending = useRef(false);
  const sequence = useRef(0);
  async function refresh() {
    if (!ready || !apiPath) return;
    const request = ++sequence.current;
    try {
      const response = await fetch(`${apiPath}/service-calls`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json() as CustomerServiceSnapshot;
      if (request === sequence.current) { setSnapshot(data); setLoaded(true); setNow(Date.now()); }
    } catch { if (request === sequence.current) { setLoaded(false); setMessage('failed'); } }
  }
  const reconcile = useEffectEvent(() => { void refresh(); });
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) reconcile(); }); return () => { cancelled = true; }; }, [ready, serviceRevision, open]);
  useEffect(() => { if (!open) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [open]);
  async function send(type: ServiceType) {
    if (!ready || !apiPath || sending.current) return;
    sending.current = true; setPending(type); setMessage(null); sequence.current++;
    try {
      const response = await fetch(`${apiPath}/service-calls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }), signal: AbortSignal.timeout(15_000) });
      if (response.status === 429) setMessage('cooldown');
      else if (!response.ok) setMessage('failed');
      else { const result = await response.json() as { alreadyPending: boolean }; setMessage(result.alreadyPending ? 'alreadyPending' : 'sent'); }
    } catch { setMessage('failed'); }
    finally { await refresh(); sending.current = false; setPending(null); }
  }
  return <><button type="button" disabled={!ready} onClick={() => setOpen(true)} className="mt-5 mb-5 min-h-12 rounded-full border border-amber-300 bg-amber-50 px-6 font-bold disabled:opacity-50"><span aria-hidden="true" className="me-2">🔔</span>{t('service')}</button>{open && <Sheet title={t('service')} onClose={() => setOpen(false)}><div className="space-y-4 p-5 sm:p-7"><p className="text-sm text-stone-500">{live(`connection.${realtimeState}`)}</p>{message && <p role={message === 'failed' ? 'alert' : 'status'} className="rounded-xl bg-amber-50 p-4">{t(message)}</p>}{serviceTypes.map(type => {
    const call = snapshot.calls.find(item => item.type === type);
    const active = call && call.status !== 'RESOLVED';
    const seconds = call ? Math.max(0, Math.ceil((Date.parse(call.createdAt) + SERVICE_COOLDOWN_MS - now) / 1000)) : 0;
    return <section key={type} data-testid={`customer-service-${type}`} className=" rounded-2xl border border-stone-200 p-4"><button type="button" disabled={!loaded || pending !== null || !!active || seconds > 0} onClick={() => void send(type)} className="min-h-14 w-full rounded-xl bg-emerald-950 px-5 text-lg font-bold text-white disabled:bg-stone-200 disabled:text-stone-600"><span aria-hidden="true" className="me-3">{icons[type]}</span>{t(`action.${type}`)}</button>{call && <p role="status" className="mt-3 text-sm font-bold">{t(`status.${call.status}`)}</p>}{!active && seconds > 0 && <p className="mt-2 text-sm text-stone-500">{t('wait', { seconds })}</p>}</section>;
  })}<button type="button" onClick={() => void refresh()} className="min-h-12 rounded-full border px-5 font-bold">{t('refresh')}</button></div></Sheet>}</>;
}
