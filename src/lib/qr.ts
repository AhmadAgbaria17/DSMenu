import { slugSchema, tableNumberSchema } from './validators/common';

export function tableQrUrl(origin: string, slug: string, tableNumber: number) {
  const url = new URL(`/r/${slugSchema.parse(slug)}`, origin);
  url.searchParams.set('table', String(tableNumberSchema.parse(tableNumber)));
  return url.toString();
}

export function takeawayQrUrl(origin: string, slug: string) { const url = new URL(`/r/${slugSchema.parse(slug)}`, origin); url.searchParams.set('mode', 'takeaway'); return url.toString(); }
