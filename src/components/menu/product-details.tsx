'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { localizedDescription } from '@/lib/menu';
import { formatMoney } from '@/lib/money';
import { cartLineKey, MAX_CART_LINES, MAX_NOTE_LENGTH, MAX_QUANTITY, noteSchema } from '@/lib/cart';
import type { PublicProduct } from '@/types/menu';
import { useCart } from '@/components/cart/cart-provider';
import { Sheet } from '@/components/shared/sheet';
import { MenuImage } from './menu-image';
import { QuantityControl } from './quantity-control';

export function ProductDetails({ product, currency, onClose, onAdded }: {
  product: PublicProduct; currency: string; onClose: () => void; onAdded: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Shopping');
  const menu = useTranslations('Menu');
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const noteId = useId();
  const name = localizedName(product, locale);
  const existing = cart.lines.find(line => cartLineKey(line) === cartLineKey({ productId: product.id, note: note.trim() }));
  const remaining = MAX_QUANTITY - (existing?.quantity ?? 0);
  const full = !existing && cart.lines.length >= MAX_CART_LINES;
  const canAdd = cart.ready && cart.canOrder && !cart.locked && product.isAvailable && quantity <= remaining && !full && noteSchema.safeParse(note).success;
  return <Sheet title={name} onClose={onClose}>
    <MenuImage image={product.image} alt={name} className="aspect-[16/8] w-full" />
    <form className="space-y-6 p-5 sm:p-7" onSubmit={event => {
      event.preventDefault();
      if (!canAdd) return;
      cart.dispatch({ type: 'add', productId: product.id, quantity, note });
      onAdded();
    }}>
      <div><p className="text-lg font-bold"><bdi>{formatMoney(product.price, locale, currency)}</bdi></p><p className="mt-3 leading-7 text-stone-600">{localizedDescription(product, locale)}</p></div>
      {!product.isAvailable ? <p className="rounded-xl bg-stone-100 p-4 text-stone-700">{menu('unavailable')}</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-4"><span className="font-bold">{t('quantity')}</span><QuantityControl quantity={quantity} name={name} onChange={setQuantity} /></div>
        <div><label htmlFor={noteId} className="mb-2 block font-bold">{t('note')}</label><textarea id={noteId} value={note} onChange={event => setNote(event.target.value)} maxLength={MAX_NOTE_LENGTH} rows={3} placeholder={t('notePlaceholder')} className="w-full resize-y rounded-xl border border-stone-300 p-4 text-base" /><p className="mt-1 text-end text-xs text-stone-500">{t('noteLimit', { count: note.length, max: MAX_NOTE_LENGTH })}</p></div>
      </>}
      {!cart.canOrder && <p className="text-sm text-amber-900">{t('selectTable')}</p>}
      {(quantity > remaining || full) && <p role="status" className="text-sm text-amber-900">{t('limit')}</p>}
      <button type="submit" disabled={!canAdd} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 rounded-full bg-emerald-950 px-6 font-bold text-white"><span>{t('addToOrder')}</span><bdi>{formatMoney(product.price * quantity, locale, currency)}</bdi></button>
    </form>
  </Sheet>;
}
