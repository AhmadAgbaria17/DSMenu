'use client';
import { OptionSummary } from '@/components/shared/option-summary';
import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { formatMoney } from '@/lib/money';
import { transitions } from '@/lib/order-flow';
import type { LiveOrder } from '@/types/live-orders';
import type { OrderStatus } from '@/types/orders';

export function StaffOrderCard({ order, now, pending, update }: { order: LiveOrder; now: number; pending: boolean; update: (order: LiveOrder, status: OrderStatus) => void }) {
  const t = useTranslations('LiveOrders');
  const takeaway = useTranslations('Takeaway');
  const statusText = useTranslations('Orders');
  const locale = useLocale();
  const minutes = Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60_000));
  return <article data-testid={`staff-order-${order.id}`} className={`rounded-2xl border bg-white p-5 shadow-sm ${order.status === 'NEW' ? 'border-amber-400 border-s-4' : 'border-stone-200'}`}>
    {order.fulfillmentType === 'TAKEAWAY' && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-black">{takeaway('title')}</p><p dir="auto" className="mt-2 break-words text-xl font-bold">{order.customerName}</p><p dir="ltr" className="mt-1 text-start text-lg">{order.customerPhone}</p></div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">{statusText('number', { number: order.orderNumber })}</h3><span className="rounded-full bg-stone-100 px-3 py-2 text-sm font-bold">{order.fulfillmentType === 'TAKEAWAY' && order.status === 'SERVED' ? takeaway('pickedUp') : statusText(`status.${order.status}`)}</span></div>
    <time dateTime={order.createdAt} title={new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(order.createdAt))} className="mt-3 block text-sm text-stone-500">{minutes === 0 ? t('justNow') : t('minutesAgo', { count: minutes })}</time>
    <ul className="my-5 space-y-4">{order.items.map((item, index) => <li key={index}><p className="text-lg font-semibold">{item.quantity} × {localizedName(item, locale)}</p><OptionSummary groups={item.optionGroups} />{item.note && <p dir="auto" className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-amber-50 p-3 text-sm text-stone-700">{item.note}</p>}</li>)}</ul>
    {order.notes && <p dir="auto" className="mb-4 whitespace-pre-wrap break-words rounded-lg bg-amber-50 p-3">{order.notes}</p>}
    <p className="border-t border-stone-100 pt-4 text-end text-xl font-bold"><bdi>{formatMoney(order.subtotal, locale, order.currency)}</bdi></p>
    <div className="mt-5 flex flex-wrap gap-3">{transitions[order.status].map(status => <button type="button" key={status} disabled={pending} onClick={() => { if (status !== 'CANCELLED' || window.confirm(t('cancelConfirm'))) update(order, status); }} className={`min-h-14 flex-1 rounded-xl px-5 font-bold ${status === 'CANCELLED' ? 'border border-red-200 text-red-800' : 'bg-emerald-950 text-white'}`}>{pending ? t('updating') : order.fulfillmentType === 'TAKEAWAY' && status === 'SERVED' ? takeaway('markPickedUp') : t(`actions.${status}`)}</button>)}</div>
  </article>;
}
