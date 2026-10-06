import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure, StaffApiError } from '@/lib/staff-http';
import { imageContext, replaceMenuImage } from '@/lib/services/menu-images';
import { MAX_IMAGE_BYTES, InvalidImageError } from '@/lib/image-validation';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ kind: string; id: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const { kind, id } = await context.params;
    const target = await imageContext(kind, id);
    const mime = request.headers.get('content-type') ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new StaffApiError('INVALID_REQUEST', 415);
    if (Number(request.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new StaffApiError('INVALID_REQUEST', 413);
    const reader = request.body?.getReader(); if (!reader) throw new StaffApiError('INVALID_REQUEST', 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX_IMAGE_BYTES) { await reader.cancel(); throw new StaffApiError('INVALID_REQUEST', 413); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    return customerJson(await replaceMenuImage(target, Buffer.concat(chunks), mime));
  } catch (error) { return error instanceof InvalidImageError ? customerJson({ error: { code: 'INVALID_IMAGE' } }, 422) : staffFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { requireSameOrigin(request); const { kind, id } = await context.params; return customerJson(await replaceMenuImage(await imageContext(kind, id))); }
  catch (error) { return staffFailure(error); }
}
