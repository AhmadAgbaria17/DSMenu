import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { closeEmptyTableSessions } from '@/lib/services/empty-table-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return json({ error: 'Scheduler is not configured' }, 503);
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json({ error: 'Unauthorized' }, 401);
  if (request.nextUrl.search) return json({ error: 'Query parameters are not supported' }, 400);
  try { return json(await closeEmptyTableSessions()); }
  catch {
    console.error('Empty table session cleanup failed');
    return json({ error: 'Cleanup unavailable; retry the scheduled job' }, 503);
  }
}
