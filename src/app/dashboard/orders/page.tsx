import { requireStaffSession } from "@/lib/staff-context";
import { getRestaurantOrders } from "@/lib/services/staff-orders";
import { LiveOrders } from "@/components/dashboard/live-orders";
export default async function LiveOrdersPage() {
  const staff = await requireStaffSession();
  const initial = await getRestaurantOrders();
  return <LiveOrders initial={initial} restaurantId={staff.restaurantId} />;
}
