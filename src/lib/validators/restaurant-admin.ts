import { z } from 'zod';
import { languageSchema, slugSchema } from './common';
// Onboarding reflects the language behavior actually supported by the frozen MVP.
// All three languages are available; Arabic is the first-visit default.
export const createRestaurantSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  defaultLanguage: z.literal('ar').default('ar'),
  enabledLanguages: z.array(languageSchema).length(3).refine(values => new Set(values).size === 3).default(['ar', 'he', 'en']),
  currency: z.literal('ILS').default('ILS'),
}).strict();
