import type { PublicProduct } from '@/types/menu';
import { localizedName } from '@/i18n/config';

export function localizedDescription(product: PublicProduct, locale: string) {
  return locale === 'en' ? product.descriptionEn : locale === 'he' ? product.descriptionHe : product.descriptionAr;
}

export function searchProducts(products: PublicProduct[], query: string, locale: string) {
  const search = query.trim().toLocaleLowerCase(locale);
  if (!search) return products;
  return products.filter(product =>
    `${localizedName(product, locale)} ${localizedDescription(product, locale)}`
      .toLocaleLowerCase(locale).includes(search));
}

// Remote URLs are fetched directly by the browser, never proxied through our server.
export function safeImageUrl(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
