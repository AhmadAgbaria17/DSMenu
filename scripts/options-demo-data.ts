import { Types } from 'mongoose';
import { Product } from '../src/models';
import { optionGroupsSchema, type OptionGroup } from '../src/lib/product-options';
import { seedSalt } from './demo-data';

const names = (nameAr: string, nameHe: string, nameEn: string) => ({ nameAr, nameHe, nameEn });
const id = (number: number) => `d5000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const option = (number: number, nameAr: string, nameHe: string, nameEn: string, priceDelta = 0, isDefault = false) => ({ id: id(number), ...names(nameAr, nameHe, nameEn), priceDelta, isDefault, isActive: true, sortOrder: number });
export const demoOptionGroups: OptionGroup[] = optionGroupsSchema.parse([
  { id: id(1), ...names('الخضار', 'ירקות', 'Vegetables'), type: 'INCLUDED', required: false, minSelections: 0, maxSelections: 4, sortOrder: 0, isActive: true, options: [option(10, 'خس', 'חסה', 'Lettuce', 0, true), option(11, 'طماطم', 'עגבנייה', 'Tomato', 0, true), option(12, 'مخلل', 'חמוצים', 'Pickles', 0, true), option(13, 'بصل', 'בצל', 'Onion', 0, true)] },
  { id: id(2), ...names('إضافات', 'תוספות', 'Extras'), type: 'MULTIPLE', required: false, minSelections: 0, maxSelections: 3, sortOrder: 1, isActive: true, options: [option(20, 'جبنة إضافية', 'תוספת גבינה', 'Extra Cheese', 500), option(21, 'بيض', 'ביצה', 'Egg', 600), option(22, 'قطعة لحم إضافية', 'קציצת בקר נוספת', 'Extra Patty', 1500)] },
  { id: id(3), ...names('الصلصة', 'רוטב', 'Sauce'), type: 'SINGLE', required: true, minSelections: 1, maxSelections: 1, sortOrder: 2, isActive: true, options: [option(30, 'عادية', 'רגיל', 'Regular', 0, true), option(31, 'حارة', 'חריף', 'Spicy'), option(32, 'بدون صلصة', 'ללא רוטב', 'No Sauce')] },
]);

export const optionsDemoProductId = 'd50000000000000200000064';
// A separate stable demo product: never replace Classic Burger or existing edits.
export async function seedOptionsDemo() {
  const restaurant = await seedSalt();
  const product = await Product.findOneAndUpdate({ _id: new Types.ObjectId(optionsDemoProductId), restaurantId: restaurant._id }, { $setOnInsert: {
    restaurantId: restaurant._id, categoryId: new Types.ObjectId('d50000000000000100000000'),
    ...names('برغر كلاسيك — تجربة الخيارات', 'המבורגר קלאסי — הדגמת אפשרויות', 'Classic Burger (Options Demo)'),
    descriptionAr: 'منتج تجريبي لتجربة المكونات والإضافات والصلصات.', descriptionHe: 'מוצר הדגמה לבחירת מרכיבים, תוספות ורטבים.', descriptionEn: 'Demo product for included ingredients, extras and sauces.',
    price: 4800, isAvailable: true, isFeatured: true, sortOrder: 100, optionGroups: demoOptionGroups,
  } }, { upsert: true, returnDocument: 'after', runValidators: true });
  return product;
}

// CLI target is separate from ordinary app credentials and restricted to a local demo database.
export function validateDemoTarget(uri: string | undefined, environment: string | undefined) {
  if (environment === 'production' || !uri) throw new Error('Use an isolated local demo database.');
  const url = new URL(uri);
  if (url.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/dsmenu_options_demo') throw new Error('Use an isolated local demo database.');
  return uri;
}
