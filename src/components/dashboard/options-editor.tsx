'use client';
import { useTranslations } from 'next-intl';
import type { OptionGroup } from '@/lib/product-options';
import { priceForInput, priceInput } from '@/lib/validators/menu-management';
import { inputClass } from './menu-fields';

export function OptionsEditor({ groups, onChange, disabled }: { groups: OptionGroup[]; onChange: (groups: OptionGroup[]) => void; disabled: boolean }) {
  const t = useTranslations('Options');
  const change = (id: string, patch: Partial<OptionGroup>) => onChange(groups.map(g => g.id === id ? { ...g, ...patch } : g));
  return <fieldset disabled={disabled} className="space-y-5"><legend className="mb-3 text-xl font-bold">{t('title')}</legend><p className="text-sm text-stone-600">{t('editorHint')}</p>
    {groups.map((group, index) => <fieldset key={group.id} data-testid="option-group-editor" className="space-y-4 rounded-xl border border-stone-300 p-4"><legend className="px-2 font-bold">{t('groupNumber', { number: index + 1 })}</legend>
      <div className="grid gap-3 sm:grid-cols-3">{(['Ar', 'He', 'En'] as const).map(lang => <label key={lang}>{t(`group${lang}`)}<input className={inputClass} required maxLength={160} dir={lang === 'En' ? 'ltr' : 'rtl'} value={group[`name${lang}`]} onChange={e => change(group.id, { [`name${lang}`]: e.target.value })} /></label>)}</div>
      <label className="block">{t('type')}<select aria-label={t('type')} className={inputClass} value={group.type} onChange={e => { const type = e.target.value as OptionGroup['type']; change(group.id, { type, ...(type === 'SINGLE' ? { maxSelections: 1, minSelections: Math.min(group.minSelections, 1) } : {}), ...(type === 'INCLUDED' ? { options: group.options.map(o => ({ ...o, priceDelta: 0 })) } : {}) }); }}>{(['SINGLE', 'MULTIPLE', 'INCLUDED'] as const).map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-3">{(['minSelections', 'maxSelections', 'sortOrder'] as const).map(field => <label key={field}>{t(field)}<input className={inputClass} type="number" required min={field === 'maxSelections' ? 1 : 0} max={field === 'sortOrder' ? 100000 : group.type === 'SINGLE' ? 1 : 20} step="1" value={group[field]} onChange={e => change(group.id, { [field]: Number(e.target.value) })} /></label>)}</div>
      <div className="flex flex-wrap gap-5">{(['required', 'isActive'] as const).map(field => <label key={field} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={group[field]} onChange={e => change(group.id, { [field]: e.target.checked })} />{t(field)}</label>)}</div>
      {group.options.map((option, optionIndex) => {
        const update = (patch: Partial<typeof option>) => change(group.id, { options: group.options.map(o => o.id === option.id ? { ...o, ...patch } : o) });
        return <fieldset key={`${option.id}:${group.type}`} data-testid="option-editor" className="space-y-3 rounded-lg bg-stone-50 p-3"><legend className="font-semibold">{t('optionNumber', { number: optionIndex + 1 })}</legend>
          <div className="grid gap-3 sm:grid-cols-3">{(['Ar', 'He', 'En'] as const).map(lang => <label key={lang}>{t(`option${lang}`)}<input className={inputClass} required maxLength={160} dir={lang === 'En' ? 'ltr' : 'rtl'} value={option[`name${lang}`]} onChange={e => update({ [`name${lang}`]: e.target.value })} /></label>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label>{t('extraPrice')}<input className={inputClass} inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" disabled={group.type === 'INCLUDED'} defaultValue={priceForInput(option.priceDelta)} onChange={e => { const price = priceInput.safeParse(e.target.value); update({ priceDelta: price.success ? price.data : -1 }); }} /></label><label>{t('sortOrder')}<input className={inputClass} type="number" min="0" max="100000" required step="1" value={option.sortOrder} onChange={e => update({ sortOrder: Number(e.target.value) })} /></label></div>
          <div className="flex flex-wrap gap-5">{(['isDefault', 'isActive'] as const).map(field => <label key={field} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={option[field]} onChange={e => update({ [field]: e.target.checked })} />{t(field)}</label>)}<button type="button" className="min-h-11 px-3 text-red-800" onClick={() => { if (window.confirm(t('confirmRemove'))) change(group.id, { options: group.options.filter(o => o.id !== option.id) }); }}>{t('removeOption')}</button></div>
        </fieldset>;
      })}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={group.options.length >= 20} className="min-h-11 rounded-full border px-4" onClick={() => change(group.id, { options: [...group.options, { id: crypto.randomUUID(), nameAr: '', nameHe: '', nameEn: '', priceDelta: 0, isDefault: group.type === 'INCLUDED', isActive: true, sortOrder: group.options.length }] })}>{t('addOption')}</button><button type="button" className="min-h-11 px-4 text-red-800" onClick={() => { if (window.confirm(t('confirmRemove'))) onChange(groups.filter(g => g.id !== group.id)); }}>{t('removeGroup')}</button></div>
    </fieldset>)}
  </fieldset>;
}
