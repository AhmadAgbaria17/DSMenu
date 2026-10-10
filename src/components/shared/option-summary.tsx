'use client';
import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import type { OptionSnapshot } from '@/lib/product-options';
export function OptionSummary({ groups = [] }: { groups?: OptionSnapshot[] }) {
  const locale = useLocale(); const t = useTranslations('Options');
  if (!groups.length) return null;
  return <div className="mt-2 space-y-2 text-sm" data-testid="option-summary">{groups.filter(g => g.selected.length || g.removed.length).map(g => <div key={g.id}><p className="font-semibold">{localizedName(g, locale)}</p>{g.selected.length > 0 && <p>{g.selected.map(o => localizedName(o, locale)).join(' · ')}</p>}{g.removed.length > 0 && <p className="font-semibold text-amber-900">{t('without', { names: g.removed.map(o => localizedName(o, locale)).join(' · ') })}</p>}</div>)}</div>;
}
