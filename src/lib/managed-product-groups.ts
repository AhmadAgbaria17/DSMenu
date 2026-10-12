import { localizedName } from '@/i18n/config';
import type { ManagedCategory, ManagedProduct } from '@/types/menu-management';
export function groupManagedProducts(categories: ManagedCategory[], products: ManagedProduct[], query: string, locale: string) {
  const order = (a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  const groups = [...categories].sort(order).map(category => ({ id: category.id, category: category as ManagedCategory | null, products: [] as ManagedProduct[] }));
  const orphan = { id: 'uncategorized', category: null, products: [] as ManagedProduct[] };
  const index = new Map(groups.map(group => [group.id, group]));
  const search = query.trim().toLocaleLowerCase(locale);
  for (const product of [...products].sort(order)) {
    if (search && !localizedName(product, locale).toLocaleLowerCase(locale).includes(search)) continue;
    (index.get(product.categoryId) ?? orphan).products.push(product);
  }
  return [...groups, ...(orphan.products.length ? [orphan] : [])].filter(group => !search || group.products.length);
}
