'use client';
import { useTranslations } from 'next-intl';
import type { LocalizedName } from '@/types/domain';
export const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base';
export const actionClass = 'min-h-12 rounded-xl bg-emerald-950 px-6 py-3 font-bold text-white disabled:opacity-50';
export function TranslationFields({ value, descriptions = false }: { value?: Partial<LocalizedName & { descriptionAr: string; descriptionHe: string; descriptionEn: string }>; descriptions?: boolean }) {
  const t = useTranslations('Management');
  return <div className="grid gap-5 lg:grid-cols-3">{(['Ar', 'He', 'En'] as const).map(language => <fieldset key={language} className="min-w-0 rounded-2xl border border-stone-200 p-4"><legend className="px-2 font-bold">{t(`language.${language}`)}</legend><label className="block text-sm font-bold">{t(`name${language}`)}<input name={`name${language}`} required maxLength={160} defaultValue={value?.[`name${language}`] ?? ''} dir={language === 'En' ? 'ltr' : 'rtl'} className={inputClass} /></label>{descriptions && <label className="mt-4 block text-sm font-bold">{t(`description${language}`)}<textarea name={`description${language}`} maxLength={2000} defaultValue={value?.[`description${language}`] ?? ''} dir={language === 'En' ? 'ltr' : 'rtl'} rows={4} className={inputClass} /></label>}</fieldset>)}</div>;
}
export function Flag({ name, checked }: { name: 'isActive' | 'isAvailable' | 'isFeatured' | 'allowCustomerNote'; checked: boolean }) {
  const t = useTranslations('Management');
  return <label className="flex min-h-12 items-center gap-3 font-bold"><input name={name} type="checkbox" defaultChecked={checked} className="size-5 accent-emerald-900" />{t(name)}</label>;
}
export function SortField({ value = 0 }: { value?: number }) {
  const t = useTranslations('Management');
  return <label className="block text-sm font-bold">{t('sortOrder')}<input aria-label={t('sortOrder')} type="number" name="sortOrder" min={0} max={100000} step={1} required defaultValue={value} className={inputClass} /><span className="mt-2 block font-normal text-stone-500">{t('sortHint')}</span></label>;
}
