'use client';

import { useTranslations } from 'next-intl';
import { MAX_QUANTITY } from '@/lib/cart';

export function QuantityControl({ quantity, onChange, name, max = MAX_QUANTITY }: {
  quantity: number; onChange: (quantity: number) => void; name: string; max?: number;
}) {
  const t = useTranslations('Shopping');
  return <div role="group" aria-label={t('quantityFor', { name })} className="inline-flex items-center rounded-full border border-stone-300 bg-white" dir="ltr">
    <button type="button" disabled={quantity <= 1} aria-label={t('decrease', { name })} className="size-11 rounded-full text-xl hover:bg-stone-100" onClick={() => onChange(quantity - 1)}>−</button>
    <output aria-label={t('quantity')} className="min-w-9 text-center font-bold tabular-nums">{quantity}</output>
    <button type="button" disabled={quantity >= max} aria-label={t('increase', { name })} className="size-11 rounded-full text-xl hover:bg-stone-100" onClick={() => onChange(quantity + 1)}>+</button>
  </div>;
}
