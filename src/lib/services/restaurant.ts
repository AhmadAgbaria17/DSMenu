import 'server-only';
import { connectMongo } from '@/lib/mongodb';
import { Restaurant, Table, Category, Product } from '@/models';
import { slugSchema, tableQuerySchema } from '@/lib/validators/common';
import type { PublicMenu, PublicImage } from '@/types/menu';
import { safeImageUrl } from '@/lib/menu';

function publicImage(image?: { url: string } | null): PublicImage | null {
  const url = safeImageUrl(image?.url);
  return url ? { url } : null;
}

export async function getPublicRestaurant(slug: string, tableQuery: string | string[] | undefined): Promise<PublicMenu | null> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  await connectMongo();
  // Only explicitly public fields leave this service. Every child query uses this tenant.
  const restaurant = await Restaurant.findOne({ slug: parsed.data, isActive: true })
    .select('name slug description logo coverImage currency primaryColor secondaryColor hideUnavailableProducts phone whatsapp address googleMapsUrl instagramUrl').lean();
  if (!restaurant) return null;
  const restaurantId = restaurant._id;
  const [tables, categories] = await Promise.all([
    Table.find({ restaurantId, isActive: true }).select('tableNumber label').sort({ tableNumber: 1 }).lean(),
    Category.find({ restaurantId, isActive: true }).select('nameAr nameHe nameEn sortOrder image').sort({ sortOrder: 1, _id: 1 }).lean(),
  ]);
  const products = await Product.find({
    restaurantId, categoryId: { $in: categories.map(category => category._id) }, isArchived: false,
    ...(restaurant.hideUnavailableProducts ? { isAvailable: true } : {}),
  }).select('categoryId nameAr nameHe nameEn descriptionAr descriptionHe descriptionEn price image isAvailable isFeatured sortOrder')
    .sort({ sortOrder: 1, _id: 1 }).lean();
  const number = tableQuerySchema.safeParse(tableQuery);
  const table = number.success ? tables.find(t => t.tableNumber === number.data) ?? null : null;
  const publicTables = tables.map(item => ({ id: String(item._id), tableNumber: item.tableNumber, label: item.label ?? '' }));
  return {
    restaurant: {
      id: String(restaurant._id), slug: restaurant.slug, name: restaurant.name,
      description: restaurant.description, currency: restaurant.currency,
      logo: publicImage(restaurant.logo), coverImage: publicImage(restaurant.coverImage),
      primaryColor: restaurant.primaryColor, phone: restaurant.phone ?? '', whatsapp: restaurant.whatsapp ?? '', address: restaurant.address ?? '',
      googleMapsUrl: restaurant.googleMapsUrl?.startsWith('https://') ? restaurant.googleMapsUrl : '', instagramUrl: restaurant.instagramUrl?.startsWith('https://') ? restaurant.instagramUrl : '',
    },
    tables: publicTables,
    table: table ? publicTables.find(item => item.id === String(table._id)) ?? null : null,
    invalidTable: tableQuery !== undefined && !table,
    categories: categories.map(item => ({ id: String(item._id), nameAr: item.nameAr, nameHe: item.nameHe, nameEn: item.nameEn, sortOrder: item.sortOrder, image: publicImage(item.image) })),
    products: products.map(item => ({
      id: String(item._id), categoryId: String(item.categoryId),
      nameAr: item.nameAr, nameHe: item.nameHe, nameEn: item.nameEn,
      descriptionAr: item.descriptionAr, descriptionHe: item.descriptionHe, descriptionEn: item.descriptionEn,
      price: item.price, image: publicImage(item.image),
      isAvailable: item.isAvailable, isFeatured: item.isFeatured, sortOrder: item.sortOrder,
    })),
  };
}
