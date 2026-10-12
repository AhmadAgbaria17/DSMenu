import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { Category, Product } from '@/models';
import { optionGroupsSchema, resolveOptions } from '@/lib/product-options';
import { moneySchema } from '@/lib/validators/common';
import type { OrderInput } from '@/lib/validators/orders';
import { CustomerRequestError } from '@/lib/customer-errors';
export async function priceOrder(input: OrderInput, restaurantId: Types.ObjectId, transaction: ClientSession) {
    const products = await Product.find({ restaurantId: restaurantId, _id: { $in: input.items.map(item => item.productId) }, isArchived: false, isAvailable: true }).session(transaction).lean();
    const categories = await Category.find({ restaurantId: restaurantId, _id: { $in: products.map(product => product.categoryId) }, isActive: true }).select('_id').session(transaction).lean();
    const categoryIds = new Set(categories.map(category => String(category._id)));
    const catalog = new Map(products.filter(product => categoryIds.has(String(product.categoryId))).map(product => [String(product._id), product]));
    const invalid = [...new Set(input.items.filter(item => !catalog.has(item.productId)).map(item => item.productId))];
    if (invalid.length) throw new CustomerRequestError('ITEMS_UNAVAILABLE', 422, invalid);
    const items = input.items.map(item => {
      const product = catalog.get(item.productId)!;
      let customization;
      try { customization = resolveOptions(optionGroupsSchema.parse(product.optionGroups ?? []), item.selections); }
      catch { throw new CustomerRequestError('ITEMS_UNAVAILABLE', 422, [item.productId]); }
      const price = product.price + customization.optionsTotal;
      return { ...customization, basePrice: product.price, productId: product._id, nameAr: product.nameAr, nameHe: product.nameHe, nameEn: product.nameEn, price, quantity: item.quantity, notes: item.note, itemTotal: price * item.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.itemTotal, 0);
    if (!moneySchema.safeParse(subtotal).success || items.some(item => !moneySchema.safeParse(item.price).success || !moneySchema.safeParse(item.itemTotal).success)) throw new CustomerRequestError('ORDER_LIMIT', 422);
    return { items, subtotal };
}
