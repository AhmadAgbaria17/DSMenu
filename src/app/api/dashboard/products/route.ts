import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { saveProduct } from '@/lib/services/menu-management';
export async function POST(request: NextRequest) { try { requireSameOrigin(request); return customerJson(await saveProduct(await readCustomerJson(request))); } catch (error) { return staffFailure(error); } }
