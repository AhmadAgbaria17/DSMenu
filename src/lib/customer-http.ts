import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { CustomerRequestError } from '@/lib/customer-errors';
import { resolveCustomerTable } from '@/lib/services/customer-session';
import { customerCookieName } from '@/lib/customer-security';

export type CustomerRouteContext = { params: Promise<{ slug: string; table: string }> };
export function customerJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function customerFailure(error: unknown) {
  if (error instanceof CustomerRequestError) return customerJson({ error: { code: error.code, ...(error.itemIds ? { itemIds: error.itemIds } : {}) } }, error.status);
  // Do not log request bodies, cookies, tokens or connection strings.
  console.error('Customer API database/service failure', { name: error instanceof Error ? error.name : 'Unknown', code: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined });
  return customerJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
}
export function requireSameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new CustomerRequestError('FORBIDDEN', 403);
}
export async function readCustomerJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new CustomerRequestError('INVALID_REQUEST', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CustomerRequestError('INVALID_REQUEST');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 100_000) { await reader.cancel(); throw new CustomerRequestError('INVALID_REQUEST', 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof CustomerRequestError) throw error;
    throw new CustomerRequestError('INVALID_REQUEST');
  } finally { reader.releaseLock(); }
}
export async function customerContext(request: NextRequest, context: CustomerRouteContext) {
  // There is no client-selectable session ID, tenant ID or other query parameter.
  if (request.nextUrl.search) throw new CustomerRequestError('INVALID_REQUEST');
  const { slug, table } = await context.params;
  const target = await resolveCustomerTable(slug, table);
  const cookieName = customerCookieName(String(target.restaurant._id), target.table.tableNumber);
  return { slug, table, target, cookieName, token: request.cookies.get(cookieName)?.value };
}
