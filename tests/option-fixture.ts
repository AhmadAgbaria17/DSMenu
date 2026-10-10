import { randomUUID } from 'node:crypto';
import type { OptionGroup } from '../src/lib/product-options';
export function optionFixture(): OptionGroup[] {
  const option = (nameEn: string, priceDelta = 0, isDefault = false) => ({ id: randomUUID(), nameAr: nameEn === 'Tomato' ? 'طماطم' : nameEn === 'Extra Cheese' ? 'جبنة إضافية' : nameEn, nameHe: nameEn === 'Tomato' ? 'עגבנייה' : nameEn === 'Extra Cheese' ? 'תוספת גבינה' : nameEn, nameEn, priceDelta, isDefault, isActive: true, sortOrder: 0 });
  const group = (nameEn: string, type: OptionGroup['type'], options: OptionGroup['options'], maxSelections: number, required = false): OptionGroup => ({ id: randomUUID(), nameAr: nameEn, nameHe: nameEn, nameEn, type, required, minSelections: required ? 1 : 0, maxSelections, sortOrder: 0, isActive: true, options: options.map((o, i) => ({ ...o, sortOrder: i })) });
  return [group('Vegetables', 'INCLUDED', ['Lettuce', 'Tomato', 'Pickles', 'Onion'].map(name => option(name, 0, true)), 4), group('Extras', 'MULTIPLE', [option('Extra Cheese', 500), option('Egg', 600), option('Extra Patty', 1500)], 2), group('Sauce', 'SINGLE', [option('Regular', 0, true), option('Spicy'), option('No Sauce')], 1, true)].map((g, i) => ({ ...g, sortOrder: i }));
}
