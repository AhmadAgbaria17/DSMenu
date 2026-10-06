import { getRestaurantOrders } from '@/lib/services/staff-orders';
import { customerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return customerJson(await getRestaurantOrders()); } catch (error) { return staffFailure(error); }
}
