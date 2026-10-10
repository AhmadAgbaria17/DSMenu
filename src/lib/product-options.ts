import { z } from 'zod';
import { moneySchema } from './validators/common';

const names = { nameAr: z.string().trim().min(1).max(160), nameHe: z.string().trim().min(1).max(160), nameEn: z.string().trim().min(1).max(160) };
export const optionSchema = z.object({ id: z.uuid(), ...names, priceDelta: moneySchema, isDefault: z.boolean(), isActive: z.boolean(), sortOrder: z.number().int().min(0).max(100000) }).strict();
export const optionGroupSchema = z.object({ id: z.uuid(), ...names, type: z.enum(['SINGLE', 'MULTIPLE', 'INCLUDED']), required: z.boolean(), minSelections: z.number().int().min(0).max(20), maxSelections: z.number().int().min(1).max(20), sortOrder: z.number().int().min(0).max(100000), isActive: z.boolean(), options: z.array(optionSchema).min(1).max(20) }).strict();
export const optionGroupsSchema = z.array(optionGroupSchema).max(10).superRefine((groups, ctx) => {
  const ids = groups.flatMap(g => [g.id, ...g.options.map(o => o.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate option/group IDs.' });
  groups.forEach((g, i) => {
    const active = g.options.filter(o => o.isActive);
    const minimum = Math.max(g.minSelections, g.required ? 1 : 0);
    if (minimum > g.maxSelections || (g.type === 'SINGLE' && g.maxSelections !== 1) || (g.isActive && active.length < minimum) || active.filter(o => o.isDefault).length > g.maxSelections || (g.type === 'INCLUDED' && g.options.some(o => o.priceDelta !== 0))) ctx.addIssue({ code: 'custom', path: [i], message: 'Invalid selection limits/defaults. Included ingredients must be free.' });
  });
});
export type OptionGroup = z.infer<typeof optionGroupSchema>;
export const selectionsSchema = z.array(z.object({ groupId: z.uuid(), optionIds: z.array(z.uuid()).max(20) })).max(10).superRefine((groups, ctx) => {
  if (new Set(groups.map(g => g.groupId)).size !== groups.length || groups.some(g => new Set(g.optionIds).size !== g.optionIds.length)) ctx.addIssue({ code: 'custom', message: 'Duplicate selections.' });
});
export type Selection = z.infer<typeof selectionsSchema>[number];
export type OptionSnapshot = Pick<OptionGroup, 'id' | 'nameAr' | 'nameHe' | 'nameEn'> & { selected: (Pick<OptionGroup['options'][number], 'id' | 'nameAr' | 'nameHe' | 'nameEn' | 'priceDelta'>)[]; removed: (Pick<OptionGroup['options'][number], 'id' | 'nameAr' | 'nameHe' | 'nameEn' | 'priceDelta'>)[] };
export function canonicalSelections(selections: Selection[] = []) { return selections.map(g => ({ groupId: g.groupId, optionIds: [...g.optionIds].sort() })).sort((a, b) => a.groupId.localeCompare(b.groupId)); }
export function sortedGroups(groups: OptionGroup[] = []) { return groups.filter(g => g.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(g => ({ ...g, options: g.options.filter(o => o.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) })); }
export function defaultSelections(groups: OptionGroup[] = []): Selection[] { return sortedGroups(groups).map(g => ({ groupId: g.id, optionIds: g.options.filter(o => o.isDefault).map(o => o.id) })); }
export function resolveOptions(groups: OptionGroup[] = [], selections?: Selection[]) {
  const parsed = selectionsSchema.safeParse(selections ?? []);
  if (!parsed.success) throw new Error('Invalid options');
  const active = sortedGroups(groups);
  if (selections === undefined && active.length) throw new Error('Options need review');
  for (const choice of parsed.data) {
    const group = active.find(g => g.id === choice.groupId);
    if (!group || choice.optionIds.some(id => !group.options.some(o => o.id === id))) throw new Error('Unavailable options');
  }
  let optionsTotal = 0;
  const optionGroups: OptionSnapshot[] = active.map(group => {
    const choice = parsed.data.find(g => g.groupId === group.id);
    const ids = choice?.optionIds ?? [];
    if ((group.type === 'INCLUDED' && !choice) || ids.length < Math.max(group.minSelections, group.required ? 1 : 0) || ids.length > group.maxSelections || (group.type === 'SINGLE' && ids.length > 1)) throw new Error('Selection limits');
    const snapshot = (o: OptionGroup['options'][number]) => ({ id: o.id, nameAr: o.nameAr, nameHe: o.nameHe, nameEn: o.nameEn, priceDelta: o.priceDelta });
    const selected = group.options.filter(o => ids.includes(o.id)).map(snapshot);
    const removed = group.type === 'INCLUDED' ? group.options.filter(o => o.isDefault && !ids.includes(o.id)).map(snapshot) : [];
    optionsTotal += selected.reduce((sum, o) => sum + o.priceDelta, 0);
    return { id: group.id, nameAr: group.nameAr, nameHe: group.nameHe, nameEn: group.nameEn, selected, removed };
  });
  moneySchema.parse(optionsTotal);
  return { optionGroups, optionsTotal };
}
