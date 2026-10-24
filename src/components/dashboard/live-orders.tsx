'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { activeOrderStatuses, operationalStatus, unseenNewOrders } from '@/lib/order-flow';
import { useActivity } from './activity-provider';
import { PreparationCard } from './preparation-card';
import { preparationGroups, type PreparationGroup } from '@/lib/preparation-groups';
import type { LiveOrder, LiveOrdersSnapshot } from '@/types/live-orders';
import type { OrderStatus } from '@/types/orders';

const filters = ['active', 'NEW', 'PREPARING', 'history'] as const;

export function LiveOrders({ initial, restaurantId }: { initial: LiveOrdersSnapshot; restaurantId: string }) {
  const t = useTranslations('LiveOrders');
  const menu = useTranslations('Menu');
  const takeaway = useTranslations('Takeaway');
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [filter, setFilter] = useState<(typeof filters)[number]>('active');
  const [error, setError] = useState<'failed' | 'conflict' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.parse(initial.fetchedAt));
  const seen = useRef(new Set(initial.orders.map(order => order.id)));
  const sequence = useRef(0);
  const mutating = useRef(false);
  const { sound, connection, pulse } = useActivity();
  async function refresh(silent = false) {
    if (mutating.current) return;
    const request = ++sequence.current;
    setRefreshing(true);
    try {
      const response = await fetch('/api/dashboard/orders', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { setSnapshot({ ...initial, orders: [], realtime: null }); router.replace('/login'); router.refresh(); return; }
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json() as LiveOrdersSnapshot;
      if (request !== sequence.current) return;
      const fresh = unseenNewOrders(seen.current, data.orders, silent);
      setSnapshot(data); setError(null);
      // One short alert for a batch of genuinely new orders, never for duplicates.
      if (fresh.length) sound.play();
    } catch { if (request === sequence.current) setError('failed'); }
    finally { if (request === sequence.current) setRefreshing(false); }
  }
  const reconcile = useEffectEvent((silent: boolean) => { void refresh(silent); });
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('dsmenu-kitchen-print');
    channel.onmessage = event => { if (event.data?.restaurantId === restaurantId) reconcile(true); };
    return () => channel.close();
  }, [restaurantId]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled && pulse.number) reconcile(pulse.silent); }); return () => { cancelled = true; }; }, [pulse.number, pulse.silent]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  async function mutate(id: string, url: string, payload: unknown) {
    if (mutating.current) return;
    mutating.current = true; sequence.current++; setPending(id); setError(null);
    let conflict = false;
    let failed = false;
    try {
      const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { router.replace('/login'); router.refresh(); }
      conflict = response.status === 409;
      failed = !response.ok && !conflict;
    } catch { failed = true; }
    finally { mutating.current = false; setPending(null); }
    await refresh(true);
    if (conflict) setError('conflict'); else if (failed) setError('failed');
  }
  function update(order: LiveOrder, status: OrderStatus) {
    return mutate(order.id, `/api/dashboard/orders/${order.id}`, { expectedStatus: order.status, status });
  }
  function prepare(group: PreparationGroup, status: 'PREPARING' | 'READY') {
    return mutate(group.key, '/api/dashboard/orders/preparation', { orderIds: group.orders.map(order => order.id), expectedStatus: group.orders[0].status, status });
  }
  const active = (order: LiveOrder) => (activeOrderStatuses as readonly string[]).includes(operationalStatus(order.status));
  const visible = snapshot.orders.filter(order => filter === 'active' ? active(order) : filter === 'history' ? !active(order) : operationalStatus(order.status) === filter);
  const groups = new Map<string, LiveOrder[]>();
  for (const order of visible) { const id = order.takeawaySessionId ?? order.tableSessionId ?? order.id; groups.set(id, [...(groups.get(id) ?? []), order]); }
  return <>
    <div className="flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-3xl font-bold">{t('title')}</h1><p role="status" className="mt-3 text-sm text-stone-600">{t(`connection.${connection}`)}</p></div><div className="flex flex-wrap gap-3"><button type="button" disabled={refreshing || pending !== null} onClick={() => void refresh()} className="min-h-12 rounded-full border border-stone-300 bg-white px-5 font-bold">{t('refresh')}</button></div></div>
    <div className="my-7 flex flex-wrap gap-2" aria-label={t('filters')}>{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-12 rounded-full px-5 text-sm font-bold ${filter === value ? 'bg-emerald-950 text-white' : 'border border-stone-200 bg-white'}`}>{t(`filter.${value}`)}</button>)}</div>
    {error && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-amber-950">{t(error)}</p>}
    {filter === 'history' && <p className="mb-5 text-sm text-stone-500">{t('historyHint')}</p>}
    {!visible.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-lg">{t('empty')}</p>}
    <div className="space-y-8">{[...groups].map(([visit, orders]) => <section key={visit} data-testid={`order-group-${visit}`}><h2 className="mb-4 text-2xl font-bold">{orders[0].fulfillmentType === 'TAKEAWAY' ? takeaway('title') : orders[0].tableNumber === null ? t('unknownTable') : menu('table', { number: orders[0].tableNumber })}<span className="ms-3 text-sm font-normal text-stone-500">{t('visit', { id: visit.slice(-6) })}</span></h2><div className="grid gap-4 xl:grid-cols-2">{preparationGroups(orders, restaurantId).map(group => <PreparationCard key={group.key} group={group} now={now} pending={pending !== null} update={(item, next) => void update(item, next)} prepare={(items, next) => void prepare(items, next)} />)}</div></section>)}</div>
  </>;
}
