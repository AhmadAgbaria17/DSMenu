import { NextRequest } from 'next/server';
import { customerJson, customerFailure, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { takeawayContext, type TakeawayContext } from '@/lib/takeaway-http';
import { requireTakeawayVisit } from '@/lib/services/takeaway-session';
import { realtimeAuthSchema, takeawayChannel } from '@/lib/realtime-channels';
import { authorizeRealtime } from '@/lib/realtime';
import { CustomerRequestError } from '@/lib/customer-errors';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: TakeawayContext) {
  try {
    requireSameOrigin(request); const { restaurant, token } = await takeawayContext(request, context); const visit = await requireTakeawayVisit(restaurant._id, token);
    const parsed = realtimeAuthSchema.safeParse(await readCustomerJson(request));
    if (!parsed.success) throw new CustomerRequestError('INVALID_REQUEST');
    if (parsed.data.channel_name !== takeawayChannel(String(visit._id))) throw new CustomerRequestError('FORBIDDEN', 403);
    const result = authorizeRealtime(parsed.data.socket_id, parsed.data.channel_name);
    return result ? customerJson(result) : customerJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  } catch (error) { return customerFailure(error); }
}
