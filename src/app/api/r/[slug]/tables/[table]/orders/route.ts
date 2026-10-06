import { NextRequest } from 'next/server';
import { customerContext, customerFailure, customerJson, readCustomerJson, requireSameOrigin, type CustomerRouteContext } from '@/lib/customer-http';
import { getCustomerOrders, submitCustomerOrder } from '@/lib/services/customer-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: CustomerRouteContext) {
  try {
    const { slug, table, token } = await customerContext(request, context);
    return customerJson(await getCustomerOrders(slug, table, token));
  } catch (error) { return customerFailure(error); }
}
export async function POST(request: NextRequest, context: CustomerRouteContext) {
  try {
    requireSameOrigin(request);
    const body = await readCustomerJson(request);
    const { slug, table, token } = await customerContext(request, context);
    return customerJson({ order: await submitCustomerOrder(slug, table, token, body) });
  } catch (error) { return customerFailure(error); }
}
