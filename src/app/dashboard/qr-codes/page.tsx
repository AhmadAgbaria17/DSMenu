import { requireStaffSession } from '@/lib/staff-context';
import { getManagedTables } from '@/lib/services/tables';
import { QrCards } from '@/components/dashboard/qr-cards';
export default async function Page() { await requireStaffSession(); return <QrCards snapshot={await getManagedTables()} />; }
