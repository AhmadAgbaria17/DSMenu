import { NextRequest } from 'next/server';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { platformFailure, requireSuperAdmin } from '@/lib/platform-context';
import { setRestaurantActive } from '@/lib/services/platform';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); await requireSuperAdmin(); return customerJson(await setRestaurantActive((await context.params).id, await readCustomerJson(request))); } catch (error) { return platformFailure(error); }
}
