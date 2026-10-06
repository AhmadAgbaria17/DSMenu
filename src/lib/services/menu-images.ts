import 'server-only';
import { Category, Product, Restaurant } from '@/models';
import { requireStaffApi, StaffApiError } from '@/lib/staff-http';
import { imageTarget } from '@/lib/validators/menu-management';
import { cleanupImage, uploadImage } from '@/lib/cloudinary';
import { validateImage } from '@/lib/image-validation';
import { invalidateMenu } from './menu-management';
export async function imageContext(kind: string, id: string) {
  const staff = await requireStaffApi();
  const parsed = imageTarget.safeParse({ kind, id });
  if (!parsed.success) throw new StaffApiError('INVALID_REQUEST', 400);
  const scope = kind === 'logo' || kind === 'coverImage' ? { _id: id, $and: [{ _id: staff.restaurantId }] } : { _id: id, restaurantId: staff.restaurantId };
  const field = kind === 'logo' || kind === 'coverImage' ? kind : 'image';
  const record = kind === 'products' ? await Product.findOne(scope).select('image').lean() : kind === 'categories' ? await Category.findOne(scope).select('image').lean() : await Restaurant.findOne(scope).select('logo coverImage').lean();
  if (!record) throw new StaffApiError('NOT_FOUND', 404);
  const stored = record as unknown as Record<string, { url: string; publicId: string } | undefined>;
  return { staff, scope, field, kind, old: stored[field], folder: (kind === 'products' || kind === 'categories' ? kind : 'restaurant') as 'products' | 'categories' | 'restaurant' };
}
export async function replaceMenuImage(context: Awaited<ReturnType<typeof imageContext>>, bytes?: Buffer, mime?: string) {
  const { staff, scope, field, kind, old, folder } = context;
  const asset = bytes ? await uploadImage(staff.restaurantId, folder, await validateImage(bytes, mime ?? '')) : null;
  // Compare the prior asset atomically so two replacements cannot delete each other's image.
  const filter = { ...scope, [`${field}.publicId`]: old?.publicId ?? null };
  const update = asset ? { $set: { [field]: asset } } : { $unset: { [field]: 1 } };
  const result = kind === 'products' ? await Product.updateOne(filter, update, { runValidators: true }) : kind === 'categories' ? await Category.updateOne(filter, update, { runValidators: true }) : await Restaurant.updateOne(filter, update, { runValidators: true });
  if (!result.matchedCount) { await cleanupImage(staff.restaurantId, asset?.publicId); throw new StaffApiError('CONFLICT', 409); }
  await cleanupImage(staff.restaurantId, old?.publicId);
  await invalidateMenu(staff.restaurantId);
  return { image: asset };
}
