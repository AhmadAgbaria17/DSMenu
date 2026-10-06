import { getRestaurantServices } from '@/lib/services/staff-services';
import { customerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { try { return customerJson(await getRestaurantServices()); } catch (error) { return staffFailure(error); } }
