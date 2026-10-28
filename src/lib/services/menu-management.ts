import { optionGroupsSchema } from '@/lib/product-options';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { Category, Product, Restaurant } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { categoryInput, productInput, productFlags, restaurantInput } from '@/lib/validators/menu-management';
import { objectIdSchema } from '@/lib/validators/common';
import type { ManagedMenu, ManagedImage } from '@/types/menu-management';
const image = (value?: { url: string; publicId: string } | null): ManagedImage => value ? { url: value.url, publicId: value.publicId } : null;
export async function invalidateMenu(restaurantId: string) {
  const restaurant = await Restaurant.findById(restaurantId).select('slug').lean();
  if (restaurant) revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath('/dashboard', 'layout');
}
export async function getManagedMenu(): Promise<ManagedMenu> {
  const staff = await requireStaffApi(); const scope = { restaurantId: staff.restaurantId };
  const [categories, products, restaurant] = await Promise.all([
    Category.find(scope).sort({ sortOrder: 1, _id: 1 }).lean(), Product.find(scope).sort({ sortOrder: 1, _id: 1 }).lean(), Restaurant.findById(staff.restaurantId).lean().orFail(),
  ]);
  return {
    categories: categories.map(c => ({ id: String(c._id), nameAr: c.nameAr, nameHe: c.nameHe, nameEn: c.nameEn, sortOrder: c.sortOrder, isActive: c.isActive, image: image(c.image) })),
    products: products.map(p => ({ id: String(p._id), categoryId: String(p.categoryId), nameAr: p.nameAr, nameHe: p.nameHe, nameEn: p.nameEn, descriptionAr: p.descriptionAr, descriptionHe: p.descriptionHe, descriptionEn: p.descriptionEn, optionGroups: optionGroupsSchema.parse(p.optionGroups ?? []), price: p.price, sortOrder: p.sortOrder, isAvailable: p.isAvailable, isFeatured: p.isFeatured, allowCustomerNote: p.allowCustomerNote !== false, isArchived: p.isArchived, image: image(p.image) })),
    restaurant: { kitchenPrintingEnabled: restaurant.kitchenPrintingEnabled !== false, id: String(restaurant._id), name: restaurant.name, slug: restaurant.slug, description: restaurant.description, phone: restaurant.phone ?? '', whatsapp: restaurant.whatsapp ?? '', address: restaurant.address ?? '', googleMapsUrl: restaurant.googleMapsUrl ?? '', instagramUrl: restaurant.instagramUrl ?? '', primaryColor: restaurant.primaryColor, logo: image(restaurant.logo), coverImage: image(restaurant.coverImage) },
  };
}
export async function saveCategory(payload: unknown, id?: string) {
  const staff = await requireStaffApi(); const parsed = categoryInput.safeParse(payload);
  if (!parsed.success || (id !== undefined && !objectIdSchema.safeParse(id).success)) throw new StaffApiError('INVALID_REQUEST', 400);
  const result = id ? await Category.findOneAndUpdate({ _id: id, restaurantId: staff.restaurantId }, { $set: parsed.data }, { runValidators: true, returnDocument: 'after' }) : await Category.create({ ...parsed.data, restaurantId: staff.restaurantId });
  if (!result) throw new StaffApiError('NOT_FOUND', 404);
  await invalidateMenu(staff.restaurantId); return { id: String(result._id) };
}
export async function saveProduct(payload: unknown, id?: string, flagsOnly = false) {
  const staff = await requireStaffApi(); const parsed = (flagsOnly ? productFlags : productInput).safeParse(payload);
  if (!parsed.success || (id !== undefined && !objectIdSchema.safeParse(id).success)) throw new StaffApiError('INVALID_REQUEST', 400);
  if (id && !await Product.exists({ _id: id, restaurantId: staff.restaurantId })) throw new StaffApiError('NOT_FOUND', 404);
  if ('categoryId' in parsed.data && !await Category.exists({ _id: parsed.data.categoryId, restaurantId: staff.restaurantId })) throw new StaffApiError('NOT_FOUND', 404);
  const result = id ? await Product.findOneAndUpdate({ _id: id, restaurantId: staff.restaurantId }, { $set: parsed.data }, { runValidators: true, returnDocument: 'after' }) : await Product.create({ ...parsed.data, restaurantId: staff.restaurantId });
  if (!result) throw new StaffApiError('NOT_FOUND', 404);
  await invalidateMenu(staff.restaurantId); return { id: String(result._id) };
}
export async function saveRestaurant(payload: unknown) {
  const staff = await requireStaffApi(); const parsed = restaurantInput.safeParse(payload);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  await Restaurant.updateOne({ _id: staff.restaurantId }, { $set: parsed.data }, { runValidators: true });
  await invalidateMenu(staff.restaurantId); return { saved: true };
}
