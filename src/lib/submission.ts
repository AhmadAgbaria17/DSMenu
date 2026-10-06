import { z } from 'zod';
import { cartStorageKey, type CartScope } from './cart';
import { objectIdSchema } from './validators/common';
import { orderInput } from './validators/orders';

const pendingSchema = z.object({ version: z.literal(1), visitId: objectIdSchema, input: orderInput });
export type PendingSubmission = z.infer<typeof pendingSchema>;
export function pendingStorageKey(scope: CartScope) { return `${cartStorageKey(scope)}:submission`; }
export function parsePending(raw: string | null): PendingSubmission | null {
  if (!raw || raw.length > 100_000) return null;
  try { const result = pendingSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : null; } catch { return null; }
}
