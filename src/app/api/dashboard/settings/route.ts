import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { saveRestaurant } from '@/lib/services/menu-management';
export async function PATCH(request: NextRequest) { try { requireSameOrigin(request); return customerJson(await saveRestaurant(await readCustomerJson(request))); } catch (error) { return staffFailure(error); } }
