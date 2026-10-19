import { z } from 'zod';
import { objectIdSchema, tableNumberSchema } from './common';
export const createTableInput = z.object({ tableNumber: tableNumberSchema, label: z.string().trim().max(100).default('') }).strict();
export const editTableInput = z.object({ label: z.string().trim().max(100), isActive: z.boolean() }).strict();
export const closeTableInput = z.object({ sessionId: objectIdSchema, billRevision: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export function tableState(active: boolean, occupied: boolean): 'AVAILABLE' | 'OCCUPIED' | 'INACTIVE' {
  return !active ? 'INACTIVE' : occupied ? 'OCCUPIED' : 'AVAILABLE';
}
