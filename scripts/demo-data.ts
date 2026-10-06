import { Types } from 'mongoose';
import { Restaurant, Table, Category, Product } from '../src/models';

const names = (nameAr: string, nameHe: string, nameEn: string) => ({ nameAr, nameHe, nameEn });
const categories = [
  names('برغر', 'המבורגרים', 'Burgers'), names('بيتزا', 'פיצה', 'Pizza'),
  names('مشروبات', 'משקאות', 'Drinks'), names('حلويات', 'קינוחים', 'Desserts'),
];
const products = [
  { category: 0, ...names('برغر كلاسيك', 'המבורגר קלאסי', 'Classic Burger'), price: 4800, descriptionAr: 'لحم مشوي، خس، طماطم وصلصة البيت.', descriptionHe: 'בשר צלוי, חסה, עגבנייה ורוטב הבית.', descriptionEn: 'Grilled beef, lettuce, tomato and our house sauce.', isFeatured: true },
  { category: 0, ...names('تشيز برغر', 'צ׳יזבורגר', 'Cheeseburger'), price: 5400, descriptionAr: 'برغر لحم مع جبنة شيدر ومخلل.', descriptionHe: 'המבורגר בקר עם צ׳דר ומלפפון חמוץ.', descriptionEn: 'Beef burger with cheddar and pickles.' },
  { category: 1, ...names('بيتزا مارغريتا', 'פיצה מרגריטה', 'Margherita'), price: 4600, descriptionAr: 'طماطم، موزاريلا وريحان طازج.', descriptionHe: 'עגבניות, מוצרלה ובזיליקום טרי.', descriptionEn: 'Tomato, mozzarella and fresh basil.', isFeatured: true },
  { category: 1, ...names('بيتزا الفطر', 'פיצה פטריות', 'Mushroom Pizza'), price: 5200, descriptionAr: 'فطر طازج، موزاريلا وزعتر.', descriptionHe: 'פטריות טריות, מוצרלה וטימין.', descriptionEn: 'Fresh mushrooms, mozzarella and thyme.' },
  { category: 2, ...names('كولا', 'קולה', 'Cola'), price: 1200, descriptionAr: 'تُقدم باردة.', descriptionHe: 'מוגשת קרה.', descriptionEn: 'Served chilled.' },
  { category: 2, ...names('ليموناضة بالنعناع', 'לימונענע', 'Mint Lemonade'), price: 1800, descriptionAr: 'ليمون طازج، نعناع وثلج.', descriptionHe: 'לימון טרי, נענע וקרח.', descriptionEn: 'Fresh lemon, mint and ice.', isFeatured: true },
  { category: 3, ...names('براوني الشوكولاتة', 'בראוניז שוקולד', 'Chocolate Brownie'), price: 3200, descriptionAr: 'براوني دافئ مع آيس كريم فانيلا.', descriptionHe: 'בראוניז חם עם גלידת וניל.', descriptionEn: 'Warm brownie with vanilla ice cream.' },
  { category: 3, ...names('تشيز كيك', 'עוגת גבינה', 'Cheesecake'), price: 3400, descriptionAr: 'تشيز كيك كريمي مع صلصة التوت.', descriptionHe: 'עוגת גבינה עשירה עם רוטב פירות יער.', descriptionEn: 'Creamy cheesecake with berry sauce.', isAvailable: false },
];

// Stable demo IDs make reruns insert-only, including after an owner renames items.
function demoId(kind: number, index: number) {
  return new Types.ObjectId(`d5000000000000${kind.toString(16).padStart(2, '0')}${index.toString(16).padStart(8, '0')}`);
}

export async function seedSalt() {
  const restaurant = await Restaurant.findOneAndUpdate({ slug: 'salt' }, {
    $setOnInsert: { name: 'Salt', slug: 'salt', description: 'Fresh food. Good company.', defaultLanguage: 'ar', enabledLanguages: ['ar', 'he', 'en'], currency: 'ILS' },
  }, { upsert: true, returnDocument: 'after', runValidators: true });
  const restaurantId = restaurant._id;
  for (let tableNumber = 1; tableNumber <= 15; tableNumber++) {
    await Table.updateOne({ restaurantId, tableNumber }, { $setOnInsert: { restaurantId, tableNumber } }, { upsert: true, runValidators: true });
  }
  for (const [index, category] of categories.entries()) {
    await Category.updateOne({ _id: demoId(1, index), restaurantId }, {
      $setOnInsert: { restaurantId, ...category, sortOrder: index },
    }, { upsert: true, runValidators: true });
  }
  for (const [index, product] of products.entries()) {
    const { category, ...fields } = product;
    await Product.updateOne({ _id: demoId(2, index), restaurantId }, {
      $setOnInsert: { restaurantId, categoryId: demoId(1, category), ...fields, sortOrder: index },
    }, { upsert: true, runValidators: true });
  }
  return restaurant;
}
