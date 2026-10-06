'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { cartLineKey } from '@/lib/cart';
import { formatMoney } from '@/lib/money';
import type { PublicRestaurant, PublicTable } from '@/types/menu';
import { Sheet } from '@/components/shared/sheet';
import { QuantityControl } from '@/components/menu/quantity-control';
import { MenuImage } from '@/components/menu/menu-image';
import { useCart } from './cart-provider';
import { SubmitOrder, CustomerOrders } from '@/components/orders/customer-orders';
import { useOrders } from '@/components/orders/orders-provider';
import { CartNote } from './cart-note';

export function MyOrderButton({ currency, tableNumber, onOpen }: { currency: string; tableNumber: number; onOpen: () => void }) {
  const cart = useCart();
  const locale = useLocale();
  const t = useTranslations('Shopping');
  const menu = useTranslations('Menu');
  return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#f8f7f2] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
    <button type="button" disabled={!cart.ready} onClick={onOpen} data-testid="my-order-button"
      className="pointer-events-auto mx-auto flex min-h-16 w-full max-w-lg items-center justify-between gap-3 rounded-2xl bg-emerald-950 px-5 py-3 text-white shadow-xl shadow-emerald-950/15">
      <span className="flex items-center gap-3"><span className="grid min-w-10 place-items-center rounded-xl bg-white/15 px-2 py-2 font-bold tabular-nums">{cart.count}</span><span className="text-start"><span className="block font-bold">{t('myOrder')}</span><span className="text-xs text-emerald-100">{menu('table', { number: tableNumber })} · {t('itemCount', { count: cart.count })}</span></span></span>
      <bdi className="font-bold">{formatMoney(cart.subtotal, locale, currency)}</bdi>
    </button>
  </div>;
}

export function MyOrderDrawer({ restaurant, table, onClose }: { restaurant: PublicRestaurant; table: PublicTable; onClose: () => void }) {
  const cart = useCart();
  const orders = useOrders();
  const orderText = useTranslations('Orders');
  const locale = useLocale();
  const t = useTranslations('Shopping');
  const menu = useTranslations('Menu');
  return <Sheet title={t('myOrder')} onClose={onClose}>
    <div className="p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-bold"><bdi>{restaurant.name}</bdi></p><span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold">{menu('table', { number: table.tableNumber })}</span></div>
      {cart.lines.length === 0 ? <div className="py-14 text-center"><p className="text-xl font-bold">{t('emptyCart')}</p><p className="mt-3 text-stone-600">{t('emptyCartHint')}</p></div>
        : <ul className="divide-y divide-stone-200">{cart.lines.map(line => {
          const name = localizedName(line.product, locale);
          const key = cartLineKey(line);
          return <li key={key} className="py-5" data-testid="cart-line">
            <div className="flex gap-4"><MenuImage image={line.product.image} alt={name} className="size-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1"><h3 className="font-bold">{name}</h3><p className="mt-1 text-sm text-stone-500">{t('unitPrice', { price: formatMoney(line.product.price, locale, restaurant.currency) })}</p>{line.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-stone-600" dir="auto">{line.note}</p>}</div>
              <bdi className="shrink-0 text-sm font-bold">{formatMoney(line.itemTotal, locale, restaurant.currency)}</bdi>
            </div>
            {orders.error?.itemIds?.includes(line.productId) && <p className="mt-3 text-sm font-bold text-red-800">{orderText('itemUnavailable')}</p>}
            <CartNote line={line} />
            <fieldset disabled={cart.locked} className="mt-4 flex items-center justify-between gap-3"><QuantityControl name={name} quantity={line.quantity} onChange={quantity => cart.dispatch({ type: 'quantity', key, quantity })} /><button type="button" aria-label={t('removeProduct', { name })} onClick={() => cart.dispatch({ type: 'remove', key })} className="min-h-11 rounded-full px-4 text-sm font-medium text-red-800 hover:bg-red-50">{t('remove')}</button></fieldset>
          </li>;
        })}</ul>}
      <div className="mt-5 border-t border-stone-200 pt-5"><div className="flex items-center justify-between gap-3 text-xl font-bold"><span>{t('subtotal')}</span><bdi data-testid="cart-subtotal">{formatMoney(cart.subtotal, locale, restaurant.currency)}</bdi></div>
        <SubmitOrder />
        <button type="button" onClick={onClose} className="mt-5 min-h-14 w-full rounded-full bg-emerald-950 px-6 font-bold text-white">{t('backToMenu')}</button>
      </div>
      <CustomerOrders />
    </div>
  </Sheet>;
}
