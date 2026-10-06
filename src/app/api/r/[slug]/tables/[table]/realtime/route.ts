import { NextRequest } from 'next/server';
import { customerContext, customerFailure, customerJson, readCustomerJson, requireSameOrigin, type CustomerRouteContext } from '@/lib/customer-http';
import { requireCustomerVisit } from '@/lib/services/customer-session';
import { realtimeAuthSchema, visitChannel } from '@/lib/realtime-channels';
import { authorizeRealtime } from '@/lib/realtime';
import { CustomerRequestError } from '@/lib/customer-errors';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: CustomerRouteContext) {
  try {
    requireSameOrigin(request);
    const { target, token } = await customerContext(request, context);
    const visit = await requireCustomerVisit(target, token);
    const input = realtimeAuthSchema.safeParse(await readCustomerJson(request));
    if (!input.success) throw new CustomerRequestError('INVALID_REQUEST');
    if (input.data.channel_name !== visitChannel(String(visit._id))) throw new CustomerRequestError('FORBIDDEN', 403);
    const result = authorizeRealtime(input.data.socket_id, input.data.channel_name);
    return result ? customerJson(result) : customerJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  } catch (error) { return customerFailure(error); }
}
