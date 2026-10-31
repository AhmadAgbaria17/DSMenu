import { z } from 'zod';
import { objectIdSchema } from './validators/common';

export const tableAccessCode = z.string().regex(/^[0-9]{3}$/);
export const tableAccessInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('OPEN'), sessionId: objectIdSchema.nullable() }).strict(),
  z.object({ action: z.literal('CREATE'), code: tableAccessCode }).strict(),
  z.object({ action: z.literal('JOIN'), code: tableAccessCode, sessionId: objectIdSchema }).strict(),
  z.object({ action: z.literal('SETUP'), code: tableAccessCode, sessionId: objectIdSchema }).strict(),
]);
export const TABLE_CODE_ATTEMPTS = 5;
export const TABLE_CODE_WINDOW_MS = 5 * 60_000;
export type TableAccessState = { mode: 'OPEN'; sessionId: string | null } | { mode: 'CREATE' | 'WAIT' } | { mode: 'JOIN' | 'SETUP'; sessionId: string } | { mode: 'AUTHORIZED'; visitId: string };
