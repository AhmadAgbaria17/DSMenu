import { z } from 'zod';
import { objectIdSchema } from './validators/common';

export const kitchenUnitSchema = z.object({ kind: z.enum(['batch', 'order']), id: objectIdSchema }).strict();
export const kitchenPrintInput = z.object({
  expectedCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  requestId: z.uuid(),
}).strict();
export type KitchenUnit = z.infer<typeof kitchenUnitSchema>;
export type KitchenPrintMetadata = { count: number; printedAt: string | null };
export const kitchenUnitKey = (unit: KitchenUnit) => `${unit.kind}:${unit.id}`;
export function kitchenUnit(order: { id: string; preparationBatchId?: string }): KitchenUnit {
  return order.preparationBatchId ? { kind: 'batch', id: order.preparationBatchId } : { kind: 'order', id: order.id };
}
export const kitchenPrintUrl = (unit: KitchenUnit) => `/print/kitchen/${unit.kind}/${unit.id}`;
