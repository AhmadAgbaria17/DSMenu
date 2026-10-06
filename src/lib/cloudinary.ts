import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cloudinaryEnv } from './env';
type Asset = { url: string; publicId: string };
async function cloudRequest(action: 'upload' | 'destroy', parameters: Record<string, string>, bytes?: Buffer) {
  const env = cloudinaryEnv();
  const signed = { ...parameters, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = createHash('sha256').update(Object.entries(signed).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&') + env.apiSecret).digest('hex');
  const body = new FormData();
  for (const [key, value] of Object.entries(signed)) body.set(key, value);
  body.set('api_key', env.apiKey); body.set('signature', signature);
  if (bytes) body.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), 'image.webp');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/image/${action}`, { method: 'POST', body, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Image provider unavailable');
  return await response.json() as unknown;
}
export async function uploadImage(restaurantId: string, folder: 'restaurant' | 'categories' | 'products', bytes: Buffer): Promise<Asset> {
  const publicId = `dsmenu/${restaurantId}/${folder}/${randomUUID()}`;
  const result = z.object({ public_id: z.string(), version: z.number().int().positive(), format: z.literal('webp') }).parse(await cloudRequest('upload', { public_id: publicId, overwrite: 'false' }, bytes));
  if (result.public_id !== publicId) throw new Error('Unexpected image response');
  const env = cloudinaryEnv();
  return { publicId, url: `https://res.cloudinary.com/${env.cloudName}/image/upload/f_auto,q_auto,c_limit,w_1600/v${result.version}/${publicId}.webp` };
}
export async function cleanupImage(restaurantId: string, publicId?: string | null) {
  // Never delete legacy/external assets, another tenant's assets, or caller-supplied IDs.
  if (!publicId?.startsWith(`dsmenu/${restaurantId}/`)) return;
  try { await cloudRequest('destroy', { public_id: publicId, invalidate: 'true' }); }
  catch { console.error('Cloudinary cleanup failed; database state preserved'); }
}
