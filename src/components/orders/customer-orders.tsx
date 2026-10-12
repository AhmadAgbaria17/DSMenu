'use client';
import { OptionSummary } from '@/components/shared/option-summary';

import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { formatMoney } from '@/lib/money';
import { useCart } from '@/components/cart/cart-provider';
import { useOrders } from './orders-provider';

export function SubmitOrder() {
  const orders = useOrders();
  const cart = useCart();
  const locale = useLocale();
  const t = useTranslations('Orders');
  const takeaway = useTranslations('Takeaway');
  return <div className="mt-5 space-y-4">
    {orders.connecting && <p role="status" className="text-sm text-stone-600">{t('connecting')}</p>}
    {orders.error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p>{t(`errors.${orders.error.code}`)}</p>
      {!orders.ready && <button type="button" disabled={orders.connecting} onClick={() => void orders.connect()} className="mt-2 min-h-11 rounded-full bg-white px-4 font-bold">{t('connect')}</button>}
      {orders.uncertain && <button type="button" disabled={orders.busy} onClick={() => { if (window.confirm(t('discardWarning'))) orders.discardPending(); }} className="mt-2 min-h-11 rounded-full bg-white px-4 font-bold">{t('discardPending')}</button>}
      {(orders.error.code === 'SESSION_CLOSED' || orders.error.code === 'SESSION_REQUIRED') && <button type="button" disabled={orders.busy} onClick={() => window.location.reload()} className="mt-2 min-h-11 rounded-full bg-white px-4 font-bold">{t('newVisit')}</button>}
    </div>}
    {orders.confirmed && <div role="status" data-testid="order-success" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><p className="font-bold">{t('success')}</p><p className="mt-2">{t('number', { number: orders.confirmed.orderNumber })} · {orders.confirmed.fulfillmentType === 'TAKEAWAY' && ['READY', 'SERVED'].includes(orders.confirmed.status) ? takeaway(orders.confirmed.status === 'READY' ? 'ready' : 'pickedUp') : t(`status.${orders.confirmed.status}`)}</p><p className="mt-2 font-bold">{t('finalTotal', { price: formatMoney(orders.confirmed.subtotal, locale, orders.confirmed.currency) })}</p></div>}
    {(cart.lines.length > 0 || orders.uncertain) && <>
      <p className="text-sm leading-6 text-stone-600">{t('pricing')}</p>
      <button type="button" onClick={() => void orders.send()} disabled={(!orders.uncertain && cart.lines.some(line => line.needsReview)) || !orders.ready || orders.busy || orders.connecting || orders.error?.code === 'VISIT_CHANGED'} className="min-h-14 w-full rounded-full bg-emerald-950 px-6 font-bold text-white" data-testid="send-order">
        {orders.busy ? t('sending') : orders.uncertain ? t('retry') : t('send')}
      </button>
    </>}
  </div>;
}

export function CustomerOrders() {
  const orders = useOrders();
  const locale = useLocale();
  const t = useTranslations('Orders');
  const takeaway = useTranslations('Takeaway');
  const live = useTranslations('LiveOrders');
  return <section className="mt-8 border-t border-stone-200 pt-6" aria-labelledby="submitted-orders-title">
    <div className="flex items-center justify-between gap-4"><h3 id="submitted-orders-title" className="text-xl font-bold">{t('title')}</h3><button type="button" disabled={!orders.ready || orders.connecting || orders.busy} onClick={() => void orders.refresh()} className="min-h-11 rounded-full border border-stone-200 px-4 text-sm font-bold">{t('refresh')}</button></div>
    <p className="mt-2 text-sm text-stone-500">{t('visitHint')}</p>
    <p role="status" className="mt-2 text-sm text-stone-500">{live(`connection.${orders.realtimeState}`)}</p>
    {!orders.orders.length && <p className="py-6 text-sm text-stone-600">{t('empty')}</p>}
    <div className="mt-4 space-y-4">{orders.orders.map(order => <article key={order.id} data-testid="submitted-order" className="rounded-2xl border border-stone-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">{t('number', { number: order.orderNumber })}</h4><span className="rounded-full bg-stone-100 px-3 py-1 text-sm">{order.fulfillmentType === 'TAKEAWAY' && ['READY', 'SERVED'].includes(order.status) ? takeaway(order.status === 'READY' ? 'ready' : 'pickedUp') : t(`status.${order.status}`)}</span></div>
      <time dateTime={order.createdAt} className="mt-2 block text-xs text-stone-500">{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(order.createdAt))}</time>
      <ul className="my-4 space-y-3">{order.items.map((item, index) => <li key={`${item.productId}:${index}`}><div className="flex justify-between gap-3 text-sm"><span>{item.quantity} × {localizedName(item, locale)}</span><bdi>{formatMoney(item.itemTotal, locale, order.currency)}</bdi></div><OptionSummary groups={item.optionGroups} />{item.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-500" dir="auto">{item.note}</p>}</li>)}</ul>
      <p className="border-t border-stone-100 pt-3 text-end font-bold"><bdi>{formatMoney(order.subtotal, locale, order.currency)}</bdi></p>
    </article>)}</div>
  </section>;
}
