import { z } from 'zod';
import { optionGroupsSchema, type OptionGroup } from './product-options';

// Reuse the full existing selection/default validation for one saved group.
export const templatePayload = z.object({
  templateName: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  group: z.unknown().transform((group, ctx) => {
    const parsed = optionGroupsSchema.safeParse([group]);
    if (!parsed.success) { ctx.addIssue({ code: 'custom', message: 'Invalid option group' }); return z.NEVER; }
    return parsed.data[0];
  }),
}).strict();
export type OptionTemplate = { id: string; templateName: string; isActive: boolean; group: OptionGroup };
export function copyOptionGroup(group: OptionGroup, newId: () => string): OptionGroup {
  return { ...group, id: newId(), options: group.options.map(option => ({ ...option, id: newId() })) };
}
export function templateAlreadyAdded(groups: OptionGroup[], id: string) {
  return groups.some(group => group.sourceTemplateId === id);
}
