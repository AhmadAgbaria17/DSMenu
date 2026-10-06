import { z } from 'zod';
import { objectIdSchema } from './common';
import { MAX_CART_LINES, MAX_QUANTITY, noteSchema, cartLineKey } from '@/lib/cart';

export const orderItemInput = z.object({
  productId: objectIdSchema.transform(value => value.toLowerCase()),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  note: noteSchema,
});
// Unknown client fields (prices, names, tenant IDs, totals) are deliberately stripped.
export const orderInput = z.object({
  clientRequestId: z.uuid(),
  items: z.array(orderItemInput).min(1).max(MAX_CART_LINES),
}).superRefine((value, context) => {
  const keys = value.items.map(cartLineKey);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Duplicate product/note lines.' });
});
export type OrderInput = z.infer<typeof orderInput>;
