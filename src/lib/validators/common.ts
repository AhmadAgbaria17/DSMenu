import { z } from 'zod';
import { languages } from '@/types/domain';

export const languageSchema = z.enum(languages);
export const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const tableNumberSchema = z.number().int().min(1).max(9999);
export const tableQuerySchema = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(tableNumberSchema);
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const moneySchema = z.number().int().min(0).max(100_000_000);
