import { NextRequest } from 'next/server';
import { updateOrderStatus } from '@/lib/services/staff-orders';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const body = await readCustomerJson(request);
    return customerJson({ order: await updateOrderStatus((await context.params).id, body) });
  } catch (error) { return staffFailure(error); }
}
