import QRCode from 'qrcode';
import { NextRequest, NextResponse } from 'next/server';
import { staffFailure } from '@/lib/staff-http';
import { getTableQr } from '@/lib/services/tables';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const qr = await getTableQr((await context.params).id);
    const png = await QRCode.toBuffer(qr.url, { type: 'png', width: 768, margin: 4, errorCorrectionLevel: 'M' });
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${qr.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return staffFailure(error); }
}
