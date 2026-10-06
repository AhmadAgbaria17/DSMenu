'use client';
import { useTranslations } from 'next-intl';
import type { ManagedCategory, ManagedProduct } from '@/types/menu-management';
import { TranslationFields, SortField, Flag, inputClass, actionClass } from './menu-fields';
import { priceForInput } from '@/lib/validators/menu-management';
type Props = { category?: ManagedCategory; product?: ManagedProduct; categories: ManagedCategory[]; mode: 'categories' | 'products'; pending: boolean; save: (data: Record<string, unknown>) => Promise<void> };
export function MenuEditor({ category, product, categories, mode, pending, save }: Props) {
  const t = useTranslations('Management');
  const value = mode === 'categories' ? category : product;
  return <form onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const common = { nameAr: data.get('nameAr'), nameHe: data.get('nameHe'), nameEn: data.get('nameEn'), sortOrder: Number(data.get('sortOrder')) };
    void save(mode === 'categories' ? { ...common, isActive: data.has('isActive') } : { ...common, categoryId: data.get('categoryId'), descriptionAr: data.get('descriptionAr'), descriptionHe: data.get('descriptionHe'), descriptionEn: data.get('descriptionEn'), price: data.get('price'), isAvailable: data.has('isAvailable'), isFeatured: data.has('isFeatured'), isArchived: product?.isArchived ?? false });
  }} className="space-y-6" aria-busy={pending}>
    <TranslationFields value={value} descriptions={mode === 'products'} />
    {mode === 'products' && <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-bold">{t('category')}<select aria-label={t('category')} name="categoryId" required defaultValue={product?.categoryId ?? ''} className={inputClass}><option value="">{t('chooseCategory')}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.nameAr} / {item.nameHe} / {item.nameEn}{item.isActive ? '' : ` (${t('inactive')})`}</option>)}</select></label><label className="block text-sm font-bold">{t('price')}<input aria-label={t('price')} name="price" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={10} dir="ltr" defaultValue={product ? priceForInput(product.price) : ''} className={inputClass} /><span className="mt-2 block font-normal text-stone-500">{t('priceHint')}</span></label></div>}
    <SortField value={value?.sortOrder} />
    <div className="flex flex-wrap gap-6">{mode === 'categories' ? <Flag name="isActive" checked={category?.isActive ?? true} /> : <><Flag name="isAvailable" checked={product?.isAvailable ?? true} /><Flag name="isFeatured" checked={product?.isFeatured ?? false} /></>}</div>
    <button type="submit" disabled={pending || (mode === 'products' && !categories.length)} className={actionClass}>{t(pending ? 'saving' : 'save')}</button>
  </form>;
}
