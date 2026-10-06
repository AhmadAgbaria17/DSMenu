import { NextRequest } from 'next/server';
import { customerContext, customerFailure, customerJson, readCustomerJson, requireSameOrigin, type CustomerRouteContext } from '@/lib/customer-http';
import { getCustomerServices, submitCustomerService, ServiceCooldownError } from '@/lib/services/customer-services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: CustomerRouteContext) {
  try { const { slug, table, token } = await customerContext(request, context); return customerJson(await getCustomerServices(slug, table, token)); }
  catch (error) { return customerFailure(error); }
}
export async function POST(request: NextRequest, context: CustomerRouteContext) {
  try {
    requireSameOrigin(request);
    const body = await readCustomerJson(request);
    const { slug, table, token } = await customerContext(request, context);
    return customerJson(await submitCustomerService(slug, table, token, body));
  } catch (error) {
    if (error instanceof ServiceCooldownError) {
      const response = customerJson({ error: { code: 'COOLDOWN', retryAt: error.retryAt } }, 429);
      response.headers.set('Retry-After', String(Math.max(1, Math.ceil((Date.parse(error.retryAt) - Date.now()) / 1000))));
      return response;
    }
    return customerFailure(error);
  }
}
