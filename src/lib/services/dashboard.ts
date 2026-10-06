import 'server-only';
import { redirect } from 'next/navigation';
import { Restaurant, Table, TableSession, Order, ServiceCall } from '@/models';
import { requireStaffSession } from '@/lib/staff-context';

export async function getDashboardRestaurant() {
  const staff = await requireStaffSession();
  const restaurant = await Restaurant.findOne({ _id: staff.restaurantId, isActive: true }).select('name slug').lean();
  if (!restaurant) redirect('/login');
  return { name: restaurant.name, slug: restaurant.slug };
}
// Accept no client-selected ID: authorization belongs inside the data service too.
export async function getDashboardOverview() {
  const staff = await requireStaffSession();
  const scope = { restaurantId: staff.restaurantId };
  const [activeTables, activeVisits, newOrders, serviceCalls] = await Promise.all([
    Table.countDocuments({ ...scope, isActive: true }),
    TableSession.countDocuments({ ...scope, status: 'ACTIVE' }),
    Order.countDocuments({ ...scope, status: 'NEW' }),
    ServiceCall.countDocuments({ ...scope, status: { $in: ['PENDING', 'ACKNOWLEDGED'] } }),
  ]);
  return { activeTables, activeVisits, newOrders, serviceCalls };
}
