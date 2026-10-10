import { optionGroupsSchema } from '../product-options';
import { z } from 'zod';
import { objectIdSchema } from './common';
export const priceInput = z.string().trim().regex(/^\d{1,7}(?:\.\d{1,2})?$/).transform(value => {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}).pipe(z.number().int().min(0).max(100_000_000));
export function priceForInput(agorot: number) { return `${Math.floor(agorot / 100)}.${String(agorot % 100).padStart(2, '0')}`; }
const name = z.string().trim().min(1).max(160);
const names = { nameAr: name, nameHe: name, nameEn: name };
const sortOrder = z.number().int().min(0).max(100_000);
export const categoryInput = z.object({ ...names, sortOrder, isActive: z.boolean() }).strict();
export const productInput = z.object({ ...names, optionGroups: optionGroupsSchema.optional(), categoryId: objectIdSchema, descriptionAr: z.string().trim().max(2000), descriptionHe: z.string().trim().max(2000), descriptionEn: z.string().trim().max(2000), price: priceInput, sortOrder, isAvailable: z.boolean(), isFeatured: z.boolean(), isArchived: z.boolean() }).strict();
export const productFlags = z.object({ isAvailable: z.boolean().optional(), isFeatured: z.boolean().optional(), isArchived: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
const optionalUrl = z.union([z.literal(''), z.url().max(1000).refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; })]);
export const restaurantInput = z.object({ name, description: z.string().trim().max(2000), phone: z.string().trim().max(60), whatsapp: z.string().trim().max(60), address: z.string().trim().max(500), googleMapsUrl: optionalUrl, instagramUrl: optionalUrl, primaryColor: z.string().regex(/^#[a-f\d]{6}$/i) }).strict();
export const imageKinds = ['products', 'categories', 'logo', 'coverImage'] as const;
export const imageTarget = z.object({ kind: z.enum(imageKinds), id: objectIdSchema }).strict();
