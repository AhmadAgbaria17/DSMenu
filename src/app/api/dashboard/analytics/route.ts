import { NextRequest } from 'next/server';
import { customerJson } from '@/lib/customer-http';
import { StaffApiError, staffFailure } from '@/lib/staff-http';
import { getAnalytics } from '@/lib/services/analytics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new StaffApiError('INVALID_REQUEST', 400);
    return customerJson(await getAnalytics(Object.fromEntries(params)));
  } catch (error) { return staffFailure(error); }
}
