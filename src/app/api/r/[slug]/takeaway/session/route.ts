import { allowTakeawayEntry } from '@/lib/takeaway-throttle';
import { CustomerRequestError } from '@/lib/customer-errors';
import { NextRequest } from 'next/server';
import { customerJson, customerFailure, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { takeawayContext, takeawayCookie, type TakeawayContext } from '@/lib/takeaway-http';
import { establishTakeaway, requireTakeawayVisit } from '@/lib/services/takeaway-session';
import { takeawayApiPath } from '@/lib/customer-path';
import { CREDENTIAL_LIFETIME_SECONDS } from '@/lib/customer-security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: TakeawayContext) {
  try { const { restaurant, token } = await takeawayContext(request, context); const visit = await requireTakeawayVisit(restaurant._id, token); return customerJson({ visitId: String(visit._id) }); } catch (error) { return customerFailure(error); }
}
export async function POST(request: NextRequest, context: TakeawayContext) {
  try {
    requireSameOrigin(request); if (!allowTakeawayEntry(request.headers.get('x-forwarded-for') ?? 'unknown')) throw new CustomerRequestError('SESSION_LIMIT', 429); const { slug, token } = await takeawayContext(request, context);
    const result = await establishTakeaway(slug, token, await readCustomerJson(request));
    const response = customerJson({ visitId: result.visitId });
    if (result.newToken && result.expiresAt) response.cookies.set(takeawayCookie(slug), result.newToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: takeawayApiPath(slug), maxAge: CREDENTIAL_LIFETIME_SECONDS, expires: result.expiresAt });
    return response;
  } catch (error) { return customerFailure(error); }
}
