import type { LocalizedName } from './domain';

// Plain DTOs only: no ObjectIds, Dates, Mongoose documents or private fields.
export type PublicImage = { url: string };
export type PublicRestaurant = {
  id: string;
  slug: string;
  name: string;
  description: string;
  currency: string;
  logo: PublicImage | null;
  coverImage: PublicImage | null;
  primaryColor?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
};
export type PublicTable = { id: string; tableNumber: number; label: string };
export type PublicCategory = LocalizedName & { id: string; sortOrder: number; image?: PublicImage | null };
export type PublicProduct = LocalizedName & {
  id: string;
  categoryId: string;
  descriptionAr: string;
  descriptionHe: string;
  descriptionEn: string;
  price: number;
  image: PublicImage | null;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
};
export type PublicMenu = {
  restaurant: PublicRestaurant;
  tables: PublicTable[];
  table: PublicTable | null;
  invalidTable: boolean;
  categories: PublicCategory[];
  products: PublicProduct[];
};
