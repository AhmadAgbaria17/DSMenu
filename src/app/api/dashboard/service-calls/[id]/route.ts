import { NextRequest } from 'next/server';
import { updateServiceStatus } from '@/lib/services/staff-services';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const body = await readCustomerJson(request); return customerJson({ call: await updateServiceStatus((await context.params).id, body) }); }
  catch (error) { return staffFailure(error); }
}
