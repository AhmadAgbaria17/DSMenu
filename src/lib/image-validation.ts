import sharp from 'sharp';
export const MAX_IMAGE_BYTES = 4_000_000;
export class InvalidImageError extends Error {}
export async function validateImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new InvalidImageError('size');
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!formats[mime]) throw new InvalidImageError('format');
  try {
    const input = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'warning' });
    const metadata = await input.metadata();
    if (metadata.format !== formats[mime] || (metadata.pages ?? 1) > 1) throw new InvalidImageError('format');
    // Full decode validates content; re-encoding strips metadata and normalizes orientation.
    return await input.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new InvalidImageError('format'); }
}
