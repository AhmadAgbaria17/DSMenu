import { NextRequest } from 'next/server';
import { z } from 'zod';
import { customerJson } from '@/lib/customer-http';
import { staffFailure, StaffApiError } from '@/lib/staff-http';
import { objectIdSchema } from '@/lib/validators/common';
import { getTableSessionBill } from '@/lib/services/table-bill';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const query = z.object({ sessionId: objectIdSchema }).strict().safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success || request.nextUrl.searchParams.getAll('sessionId').length !== 1) throw new StaffApiError('INVALID_REQUEST', 400);
    return customerJson(await getTableSessionBill((await context.params).id, query.data.sessionId));
  } catch (error) { return staffFailure(error); }
}
