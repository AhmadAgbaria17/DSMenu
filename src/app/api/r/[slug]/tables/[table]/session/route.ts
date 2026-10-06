import { NextRequest } from 'next/server';
import { customerContext, customerFailure, customerJson, readCustomerJson, requireSameOrigin, type CustomerRouteContext } from '@/lib/customer-http';
import { establishCustomerVisit } from '@/lib/services/customer-session';
import { CREDENTIAL_LIFETIME_SECONDS } from '@/lib/customer-security';
import { customerApiPath } from '@/lib/customer-path';
import { CustomerRequestError } from '@/lib/customer-errors';

export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: CustomerRouteContext) {
  try {
    requireSameOrigin(request);
    const body = await readCustomerJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new CustomerRequestError('INVALID_REQUEST');
    const { target, cookieName, token } = await customerContext(request, context);
    const result = await establishCustomerVisit(target, token);
    const response = customerJson({ visitId: result.visitId });
    if (result.newToken && result.expiresAt) response.cookies.set(cookieName, result.newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: customerApiPath(target.restaurant.slug, target.table.tableNumber),
      maxAge: CREDENTIAL_LIFETIME_SECONDS, expires: result.expiresAt,
    });
    return response;
  } catch (error) { return customerFailure(error); }
}
