import 'server-only';
import { randomUUID } from 'node:crypto';
import { ProductOptionTemplate } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { objectIdSchema } from '@/lib/validators/common';
import { optionGroupsSchema } from '@/lib/product-options';
import { templatePayload, copyOptionGroup, type OptionTemplate } from '@/lib/option-templates';

function validId(id: string) {
  if (!objectIdSchema.safeParse(id).success) throw new StaffApiError('NOT_FOUND', 404);
}
export async function listOptionTemplates(): Promise<OptionTemplate[]> {
  const staff = await requireStaffApi();
  const rows = await ProductOptionTemplate.find({ restaurantId: staff.restaurantId }).sort({ templateName: 1, _id: 1 }).lean();
  return rows.map(row => ({ id: String(row._id), templateName: row.templateName, isActive: row.isActive, group: optionGroupsSchema.parse([row.group])[0] }));
}
export async function saveOptionTemplate(payload: unknown, id?: string) {
  const staff = await requireStaffApi();
  if (id) validId(id);
  const parsed = templatePayload.safeParse(payload);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const group = copyOptionGroup(parsed.data.group, randomUUID);
  delete group.sourceTemplateId;
  const data = { ...parsed.data, group };
  const row = id
    ? await ProductOptionTemplate.findOneAndUpdate({ _id: id, restaurantId: staff.restaurantId }, { $set: data }, { runValidators: true, returnDocument: 'after' })
    : await ProductOptionTemplate.create({ ...data, restaurantId: staff.restaurantId });
  if (!row) throw new StaffApiError('NOT_FOUND', 404);
  return { id: String(row._id) };
}
export async function copyTemplateGroup(id: string) {
  const staff = await requireStaffApi(); validId(id);
  const row = await ProductOptionTemplate.findOne({ _id: id, restaurantId: staff.restaurantId, isActive: true }).lean();
  if (!row) throw new StaffApiError('NOT_FOUND', 404);
  return { group: { ...copyOptionGroup(optionGroupsSchema.parse([row.group])[0], randomUUID), sourceTemplateId: String(row._id) } };
}
export async function deleteOptionTemplate(id: string) {
  const staff = await requireStaffApi(); validId(id);
  const result = await ProductOptionTemplate.deleteOne({ _id: id, restaurantId: staff.restaurantId });
  if (!result.deletedCount) throw new StaffApiError('NOT_FOUND', 404);
  return { deleted: true };
}
export async function duplicateOptionTemplate(id: string, payload: unknown) {
  const staff = await requireStaffApi(); validId(id);
  const row = await ProductOptionTemplate.findOne({ _id: id, restaurantId: staff.restaurantId }).lean();
  if (!row) throw new StaffApiError('NOT_FOUND', 404);
  // Use the same validation and trusted tenant derivation as creation.
  const { z } = await import('zod');
  const parsed = z.object({ templateName: z.string().trim().min(1).max(120) }).strict().safeParse(payload);
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  return saveOptionTemplate({ ...parsed.data, isActive: row.isActive, group: optionGroupsSchema.parse([row.group])[0] });
}
