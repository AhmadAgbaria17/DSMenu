import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { staffFailure } from '@/lib/staff-http';
import { getTakeawayQr } from '@/lib/services/takeaway-qr';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const qr = await getTakeawayQr();
    const png = await QRCode.toBuffer(qr.url, { type: 'png', width: 768, margin: 4, errorCorrectionLevel: 'M' });
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${qr.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return staffFailure(error); }
}
