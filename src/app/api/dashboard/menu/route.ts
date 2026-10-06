import { customerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getManagedMenu } from '@/lib/services/menu-management';
export async function GET() { try { return customerJson(await getManagedMenu()); } catch (error) { return staffFailure(error); } }
