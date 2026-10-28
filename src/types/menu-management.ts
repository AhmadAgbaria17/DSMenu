import type { LocalizedName } from './domain';
export type ManagedImage = { url: string; publicId: string } | null;
export type ManagedCategory = LocalizedName & { id: string; sortOrder: number; isActive: boolean; image: ManagedImage };
export type ManagedProduct = LocalizedName & { optionGroups?: import('@/lib/product-options').OptionGroup[]; id: string; categoryId: string; descriptionAr: string; descriptionHe: string; descriptionEn: string; price: number; sortOrder: number; isAvailable: boolean; allowCustomerNote?: boolean; isFeatured: boolean; isArchived: boolean; image: ManagedImage };
export type ManagedRestaurant = { kitchenPrintingEnabled: boolean; id: string; name: string; slug: string; description: string; phone: string; whatsapp: string; address: string; googleMapsUrl: string; instagramUrl: string; primaryColor: string; logo: ManagedImage; coverImage: ManagedImage };
export type ManagedMenu = { categories: ManagedCategory[]; products: ManagedProduct[]; restaurant: ManagedRestaurant };
