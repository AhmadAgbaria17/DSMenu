'use client';
import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { sortedGroups, type OptionGroup, type Selection } from '@/lib/product-options';
import { formatMoney } from '@/lib/money';

export function OptionSelector({ groups, selections, onChange, currency }: { groups: OptionGroup[]; selections: Selection[]; onChange: (value: Selection[]) => void; currency: string }) {
  const locale = useLocale(); const t = useTranslations('Options');
  return <div className="space-y-5">{sortedGroups(groups).map(group => {
    const ids = selections.find(s => s.groupId === group.id)?.optionIds ?? [];
    const minimum = Math.max(group.minSelections, group.required ? 1 : 0);
    const set = (optionIds: string[]) => onChange([...selections.filter(s => s.groupId !== group.id), { groupId: group.id, optionIds }]);
    return <fieldset key={group.id} className="rounded-xl border border-stone-200 p-4"><legend className="px-2 font-bold">{localizedName(group, locale)}</legend>
      <p className="mb-2 text-sm text-stone-600">{t('limits', { min: minimum, max: group.maxSelections })}</p>
      {group.options.map(option => <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 py-2"><input type={group.type === 'SINGLE' ? 'radio' : 'checkbox'} name={`options-${group.id}`} checked={ids.includes(option.id)} disabled={!ids.includes(option.id) && group.type !== 'SINGLE' && ids.length >= group.maxSelections} onChange={() => set(group.type === 'SINGLE' ? [option.id] : ids.includes(option.id) ? ids.filter(id => id !== option.id) : [...ids, option.id])} className="size-5 shrink-0 accent-emerald-900" /><span className="flex-1">{localizedName(option, locale)}</span>{option.priceDelta > 0 && <bdi className="text-sm">+{formatMoney(option.priceDelta, locale, currency)}</bdi>}</label>)}
      {group.type === 'SINGLE' && minimum === 0 && <button type="button" onClick={() => set([])} className="min-h-11 rounded-full border px-4 text-sm">{t('clear')}</button>}
    </fieldset>;
  })}</div>;
}
