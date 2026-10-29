import { NextRequest } from 'next/server';
import { customerContext, customerFailure, customerJson, readCustomerJson, requireSameOrigin, type CustomerRouteContext } from '@/lib/customer-http';
import { establishCustomerVisit, getTableAccess } from '@/lib/services/customer-session';
import { CREDENTIAL_LIFETIME_SECONDS } from '@/lib/customer-security';
import { customerApiPath } from '@/lib/customer-path';


export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: CustomerRouteContext) {
  try {
    requireSameOrigin(request);
    const body = await readCustomerJson(request);
    const { target, cookieName, token } = await customerContext(request, context);
    const result = await establishCustomerVisit(target, token, body);
    const response = customerJson({ visitId: result.visitId });
    if (result.newToken && result.expiresAt) response.cookies.set(cookieName, result.newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: customerApiPath(target.restaurant.slug, target.table.tableNumber),
      maxAge: CREDENTIAL_LIFETIME_SECONDS, expires: result.expiresAt,
    });
    return response;
  } catch (error) { return customerFailure(error); }
}

export async function GET(request: NextRequest, context: CustomerRouteContext) {
  try { const { target, token } = await customerContext(request, context); return customerJson(await getTableAccess(target, token)); }
  catch (error) { return customerFailure(error); }
}
