'use client';
import { useRef, useState } from 'react';
import { TemplatePicker } from './template-actions';
import { OptionsEditor } from './options-editor';
import { optionGroupsSchema } from '@/lib/product-options';
import { useTranslations } from 'next-intl';
import type { ManagedCategory, ManagedProduct } from '@/types/menu-management';
import { TranslationFields, SortField, Flag, inputClass, actionClass } from './menu-fields';
import { priceForInput } from '@/lib/validators/menu-management';
type Props = { category?: ManagedCategory; product?: ManagedProduct; categories: ManagedCategory[]; mode: 'categories' | 'products'; pending: boolean; save: (data: Record<string, unknown>) => Promise<void> };
export function MenuEditor({ category, product, categories, mode, pending, save }: Props) {
  const t = useTranslations('Management');
  const optionText = useTranslations('Options');
  const [optionGroups, setOptionGroups] = useState(product?.optionGroups ?? []);
  const optionsSection = useRef<HTMLDivElement>(null);
  const showOptions = () => requestAnimationFrame(() => { optionsSection.current?.scrollIntoView({ block: 'start' }); optionsSection.current?.focus({ preventScroll: true }); });
  const validOptions = optionGroupsSchema.safeParse(optionGroups).success;
  const value = mode === 'categories' ? category : product;
  return <form onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const common = { nameAr: data.get('nameAr'), nameHe: data.get('nameHe'), nameEn: data.get('nameEn'), sortOrder: Number(data.get('sortOrder')) };
    void save(mode === 'categories' ? { ...common, isActive: data.has('isActive') } : { ...common, optionGroups, categoryId: data.get('categoryId'), descriptionAr: data.get('descriptionAr'), descriptionHe: data.get('descriptionHe'), descriptionEn: data.get('descriptionEn'), price: data.get('price'), isAvailable: data.has('isAvailable'), isFeatured: data.has('isFeatured'), isArchived: product?.isArchived ?? false });
  }} className="space-y-6" aria-busy={pending}>
    {mode === 'products' && <section data-testid="options-entry" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-lg font-bold">{optionText('title')}</h3><p className="mt-2 text-sm">{optionText('entryHint', { count: optionGroups.length })}</p>
      <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={pending || optionGroups.length >= 10} className={actionClass} onClick={() => { setOptionGroups([...optionGroups, { id: crypto.randomUUID(), nameAr: '', nameHe: '', nameEn: '', type: 'MULTIPLE', required: false, minSelections: 0, maxSelections: 20, sortOrder: optionGroups.length, isActive: true, options: [] }]); showOptions(); }}><span aria-hidden="true">+ </span>{optionText('addGroup')}</button><button type="button" disabled={pending} onClick={showOptions} className="min-h-12 rounded-full border border-emerald-300 bg-white px-5 font-bold">{optionText('manage')}</button></div>
      <TemplatePicker groups={optionGroups} onChange={setOptionGroups} disabled={pending} />
    </section>}
    <TranslationFields value={value} descriptions={mode === 'products'} />
    {mode === 'products' && <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-bold">{t('category')}<select aria-label={t('category')} name="categoryId" required defaultValue={product?.categoryId ?? ''} className={inputClass}><option value="">{t('chooseCategory')}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.nameAr} / {item.nameHe} / {item.nameEn}{item.isActive ? '' : ` (${t('inactive')})`}</option>)}</select></label><label className="block text-sm font-bold">{t('price')}<input aria-label={t('price')} name="price" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={10} dir="ltr" defaultValue={product ? priceForInput(product.price) : ''} className={inputClass} /><span className="mt-2 block font-normal text-stone-500">{t('priceHint')}</span></label></div>}
    <SortField value={value?.sortOrder} />
    <div className="flex flex-wrap gap-6">{mode === 'categories' ? <Flag name="isActive" checked={category?.isActive ?? true} /> : <><Flag name="isAvailable" checked={product?.isAvailable ?? true} /><Flag name="isFeatured" checked={product?.isFeatured ?? false} /></>}</div>
    {mode === 'products' && <div ref={optionsSection} tabIndex={-1} className="scroll-mt-24 rounded-xl"><OptionsEditor templates groups={optionGroups} onChange={setOptionGroups} disabled={pending} />{!validOptions && <p role="alert" className="text-red-800">{optionText('invalidConfig')}</p>}</div>}
    <button type="submit" disabled={(mode === 'products' && !validOptions) || pending || (mode === 'products' && !categories.length)} className={actionClass}>{t(pending ? 'saving' : 'save')}</button>
  </form>;
}
