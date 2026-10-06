import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { saveCategory } from '@/lib/services/menu-management';
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); return customerJson(await saveCategory(await readCustomerJson(request), (await context.params).id)); } catch (error) { return staffFailure(error); } }
