import { NextRequest } from 'next/server';
import { requireStaffApi, StaffApiError, staffFailure } from '@/lib/staff-http';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { realtimeAuthSchema, restaurantChannel } from '@/lib/realtime-channels';
import { authorizeRealtime } from '@/lib/realtime';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const staff = await requireStaffApi();
    const input = realtimeAuthSchema.safeParse(await readCustomerJson(request));
    if (!input.success) throw new StaffApiError('INVALID_REQUEST', 400);
    if (input.data.channel_name !== restaurantChannel(staff.restaurantId)) throw new StaffApiError('FORBIDDEN', 403);
    const result = authorizeRealtime(input.data.socket_id, input.data.channel_name);
    return result ? customerJson(result) : customerJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  } catch (error) { return staffFailure(error); }
}
