import { requireStaffSession } from '@/lib/staff-context';
import { getManagedMenu } from '@/lib/services/menu-management';
import { RestaurantSettings } from '@/components/dashboard/restaurant-settings';
export default async function Page() { await requireStaffSession(); return <RestaurantSettings initial={await getManagedMenu()} />; }
