import { requireStaffSession } from '@/lib/staff-context';
import { getManagedMenu } from '@/lib/services/menu-management';
import { MenuManagement } from '@/components/dashboard/menu-management';
export default async function Page() { await requireStaffSession(); return <MenuManagement initial={await getManagedMenu()} mode="categories" />; }
