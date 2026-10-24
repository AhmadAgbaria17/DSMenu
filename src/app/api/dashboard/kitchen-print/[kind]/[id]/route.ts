import { NextRequest } from 'next/server';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure, StaffApiError } from '@/lib/staff-http';
import { getKitchenTicket, recordKitchenPrint } from '@/lib/services/kitchen-print';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ kind: string; id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    if (request.nextUrl.search) throw new StaffApiError('INVALID_REQUEST', 400);
    return customerJson(await getKitchenTicket(await context.params));
  } catch (error) { return staffFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    if (request.nextUrl.search) throw new StaffApiError('INVALID_REQUEST', 400);
    return customerJson(await recordKitchenPrint(await context.params, await readCustomerJson(request)));
  } catch (error) { return staffFailure(error); }
}
