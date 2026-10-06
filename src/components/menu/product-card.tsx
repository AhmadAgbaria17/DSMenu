'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { localizedDescription } from '@/lib/menu';
import { formatMoney } from '@/lib/money';
import type { PublicProduct } from '@/types/menu';
import { MenuImage } from './menu-image';

export function ProductCard({ product, currency, onOpen, canAdd }: {
  product: PublicProduct; currency: string; onOpen: () => void; canAdd: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('Shopping');
  const menu = useTranslations('Menu');
  const name = localizedName(product, locale);
  return <article data-product-id={product.id} className="group overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition hover:border-stone-300">
    <button type="button" onClick={onOpen} className="block w-full text-start" aria-label={t('details', { name })}>
      <div className="relative"><MenuImage image={product.image} alt={name} className="aspect-[16/9] w-full" />
        {product.isFeatured && <span className="absolute start-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-amber-900">✦ {menu('featured')}</span>}
        {!product.isAvailable && <span className="absolute inset-x-0 bottom-0 bg-stone-900/85 px-4 py-2 text-center text-sm text-white">{menu('unavailable')}</span>}
      </div>
      <div className="px-5 pt-5"><h4 className="text-lg font-bold">{name}</h4><p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-stone-600">{localizedDescription(product, locale)}</p></div>
    </button>
    <div className="flex items-center justify-between gap-3 p-5 pt-3"><bdi className="font-bold">{formatMoney(product.price, locale, currency)}</bdi>
      <button type="button" disabled={!product.isAvailable || !canAdd} onClick={onOpen} aria-label={t('addProduct', { name })}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f0f3ec] px-5 text-sm font-bold text-emerald-950 enabled:hover:bg-emerald-100"><span aria-hidden="true">+</span>{t('add')}</button>
    </div>
  </article>;
}
