import { NextRequest } from 'next/server';
import { customerJson, customerFailure, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { takeawayContext, type TakeawayContext } from '@/lib/takeaway-http';
import { getTakeawayOrders, submitTakeawayOrder } from '@/lib/services/takeaway-orders';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: TakeawayContext) {
  try { const { slug, token } = await takeawayContext(request, context); return customerJson(await getTakeawayOrders(slug, token)); } catch (error) { return customerFailure(error); }
}
export async function POST(request: NextRequest, context: TakeawayContext) {
  try { requireSameOrigin(request); const { slug, token } = await takeawayContext(request, context); return customerJson({ order: await submitTakeawayOrder(slug, token, await readCustomerJson(request)) }); } catch (error) { return customerFailure(error); }
}
