import { z } from 'zod';
export const takeawayIdentity = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(7).max(32).regex(/^\+?[0-9() .-]+$/).transform(value => value.replace(/[() .-]/g, '')).pipe(z.string().regex(/^\+?[0-9]{7,15}$/)),
}).strict();
