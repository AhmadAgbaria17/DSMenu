import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
import { closeTableVisit } from '@/lib/services/tables';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); return customerJson(await closeTableVisit((await context.params).id, await readCustomerJson(request))); } catch (error) { return staffFailure(error); } }
