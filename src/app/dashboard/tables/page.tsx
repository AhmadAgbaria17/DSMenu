import { requireStaffSession } from '@/lib/staff-context';
import { getManagedTables } from '@/lib/services/tables';
import { TablesManager } from '@/components/dashboard/tables-manager';
export default async function Page() { await requireStaffSession(); return <TablesManager initial={await getManagedTables()} />; }
