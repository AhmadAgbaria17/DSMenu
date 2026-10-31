'use client';
import { useLocale, useTranslations } from 'next-intl';
import { effectiveBasePrice, type ProductPricing } from '@/lib/product-price';
import { formatMoney } from '@/lib/money';

export function ProductPrice({ product, currency }: { product: ProductPricing; currency: string }) {
  const locale = useLocale(); const t = useTranslations('Discount');
  const current = effectiveBasePrice(product);
  return <span className="relative inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1" data-testid="product-price">
    {current < product.price && <span className="text-sm font-normal text-stone-500"><span className="sr-only">{t('originalPrice')}: </span><del><bdi>{formatMoney(product.price, locale, currency)}</bdi></del></span>}
    <span className="font-bold"><span className="sr-only">{t('currentPrice')}: </span><bdi data-testid="current-price">{formatMoney(current, locale, currency)}</bdi></span>
  </span>;
}
