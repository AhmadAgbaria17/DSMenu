'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/shared/sheet';
import { localizedName } from '@/i18n/config';
import { formatMoney } from '@/lib/money';
import type { TableSessionBill } from '@/types/table-bill';
import { actionClass } from './menu-fields';

export function TableBill({ tableId, sessionId, onDismiss, onClosed }: { tableId: string; sessionId: string; onDismiss: () => void; onClosed: () => Promise<void> }) {
  const t = useTranslations('Bill'); const tables = useTranslations('Tables'); const orders = useTranslations('Orders'); const options = useTranslations('Options'); const locale = useLocale();
  const [bill, setBill] = useState<TableSessionBill | null>(null); const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false); const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const current = ++sequence.current; setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/tables/${tableId}/bill?sessionId=${sessionId}`, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const result = await response.json() as TableSessionBill;
      if (current === sequence.current && !signal?.aborted) setBill(result);
    } catch { if (current === sequence.current && !signal?.aborted) { setBill(null); setError('failed'); } }
    finally { if (current === sequence.current && !signal?.aborted) setLoading(false); }
  }, [tableId, sessionId]);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void reload(controller.signal), 0);
    const refresh = () => { if (!busy.current) void reload(controller.signal); };
    const interval = setInterval(refresh, 30000); window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [reload]);
  async function close() {
    if (!bill?.canClose || loading || busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const response = await fetch(`/api/dashboard/tables/${tableId}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, billRevision: bill.revision }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        const result = await response.json() as { error?: { code?: string } };
        const code = result.error?.code;
        setError(code === 'CONFLICT' ? 'changed' : code === 'ACTIVE_ORDERS' ? 'activeOrders' : code === 'UNRESOLVED_CALLS' ? 'calls' : 'failed');
        await reload(); return;
      }
      await onClosed();
    } catch { setError('failed'); await reload(); } finally { busy.current = false; setPending(false); }
  }
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
  const money = (value: number) => formatMoney(value, locale, bill?.currency ?? 'ILS');
  return <Sheet title={t(bill?.canClose || bill?.status === 'CLOSED' ? 'final' : 'current')} onClose={() => { if (!busy.current) onDismiss(); }}>
    <div className="space-y-5 p-5 sm:p-7" aria-busy={loading || pending}>
      <p className="text-sm text-stone-600">{t('notice')}</p>
      {loading && <p role="status">{t('loading')}</p>}
      {error && <p role="alert" className="rounded-xl bg-amber-50 p-4">{t(error)}</p>}
      <button type="button" disabled={pending || loading} className={actionClass} onClick={() => { setError(null); void reload(); }}>{t('refresh')}</button>
      {bill && <>
        <header><h2 className="text-2xl font-bold">{bill.restaurantName} · {tables('table', { number: bill.tableNumber })}</h2><p className="mt-2">{t('opened')}: <time dateTime={bill.openedAt}>{time(bill.openedAt)}</time></p></header>
        {bill.activeOrders > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-4">{t('activeOrders')}</p>}
        {bill.unresolvedCalls > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-4">{t('calls')}</p>}
        {bill.status === 'CLOSED' && <p role="status">{t('closed')}</p>}
        {!bill.orders.length && <p>{t('empty')}</p>}
        {bill.orders.map(order => <article key={order.id} data-testid="bill-order" className="rounded-2xl border p-4">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{orders('number', { number: order.orderNumber })}</h3><span>{orders(`status.${order.status}`)}</span></div>
          <time className="text-sm text-stone-500" dateTime={order.createdAt}>{time(order.createdAt)}</time>
          {order.status === 'CANCELLED' && <p className="mt-2 font-bold text-stone-600">{t('excluded')}</p>}
          <ul className="my-4 space-y-5">{order.items.map((item, index) => <li key={index} className="border-t pt-3">
            <h4 className="break-words font-bold" dir="auto">{item.quantity} × {localizedName(item, locale)}</h4>
            <p className="mt-1 text-sm">{t('unit')}: <bdi>{money(item.price)}</bdi></p>
            {(item.optionGroups ?? []).map(group => <div key={group.id} className="mt-2 text-sm">
              <p className="font-semibold">{localizedName(group, locale)}</p>
              {group.selected.map(option => <p key={option.id}>{localizedName(option, locale)}{option.priceDelta > 0 && <> +<bdi>{money(option.priceDelta)}</bdi></>}</p>)}
              {group.removed.length > 0 && <p className="text-amber-900">{options('without', { names: group.removed.map(option => localizedName(option, locale)).join(' · ') })}</p>}
            </div>)}
            {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm" dir="auto">{item.note}</p>}
            <p className="mt-2 font-bold">{t('lineTotal')}: <bdi>{money(item.itemTotal)}</bdi></p>
          </li>)}</ul>
          {order.notes && <p className="whitespace-pre-wrap break-words" dir="auto">{order.notes}</p>}
          <p className="border-t pt-3 text-end font-bold">{t('subtotal')}: <bdi>{money(order.subtotal)}</bdi>{order.status === 'CANCELLED' && <span> — {t('excluded')}</span>}</p>
        </article>)}
        <div className="rounded-xl bg-emerald-50 p-5 text-lg font-bold"><p>{t('count', { count: bill.orderCount })}</p><p data-testid="bill-total" className="mt-2 text-2xl">{t('total')}: <bdi>{money(bill.finalTotal)}</bdi></p>{bill.cancelledCount > 0 && <p className="mt-2 text-sm">{t('cancelledCount', { count: bill.cancelledCount })}</p>}</div>
        {bill.canClose && <p>{t('confirm')}</p>}
      </>}
      <div className="flex flex-wrap gap-3"><button type="button" className="min-h-12 rounded-full border px-5 font-bold" disabled={pending} onClick={onDismiss}>{t('back')}</button>
        <button type="button" data-testid="bill-close" className={actionClass} disabled={!bill?.canClose || pending || loading} onClick={() => void close()}>{tables(pending ? 'saving' : 'closeVisit')}</button>
      </div>
    </div>
  </Sheet>;
}
