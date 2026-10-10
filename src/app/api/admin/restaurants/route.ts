import { NextRequest } from 'next/server';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { platformFailure, requireSuperAdmin } from '@/lib/platform-context';
import { listPlatformRestaurants, onboardRestaurant } from '@/lib/services/platform';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { return customerJson(await listPlatformRestaurants(Number(request.nextUrl.searchParams.get('page') ?? 1))); } catch (error) { return platformFailure(error); }
}
export async function POST(request: NextRequest) {
  try { requireSameOrigin(request); await requireSuperAdmin(); return customerJson(await onboardRestaurant(await readCustomerJson(request)), 201); } catch (error) { return platformFailure(error); }
}
