'use client';
import { useTranslations } from 'next-intl';
import { kitchenUnit, kitchenPrintUrl } from '@/lib/kitchen-print';
import type { LiveOrder } from '@/types/live-orders';

export function KitchenPrintAction({ order, pending }: { order: LiveOrder; pending: boolean }) {
  const t = useTranslations('Kitchen');
  if (order.status !== 'PREPARING') return null;
  const count = order.kitchenPrint?.count ?? 0;
  return <div className="flex flex-1 flex-col gap-2" data-testid="kitchen-print-action">
    {count > 0 && <span role="status" className="text-sm font-bold text-emerald-900">{t('printed', { count })}</span>}
    <a href={kitchenPrintUrl(kitchenUnit(order))} target="_blank" rel="noopener noreferrer" aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }} className="flex min-h-14 items-center justify-center rounded-xl border-2 border-emerald-900 bg-white px-5 py-3 text-center font-bold text-emerald-950">{t(count ? 'reprint' : 'print')}</a>
  </div>;
}
