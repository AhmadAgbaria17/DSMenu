import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
import { getManagedTables, createTable } from '@/lib/services/tables';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { try { return customerJson(await getManagedTables()); } catch (error) { return staffFailure(error); } }
export async function POST(request: NextRequest) { try { requireSameOrigin(request); return customerJson(await createTable(await readCustomerJson(request))); } catch (error) { return staffFailure(error); } }
