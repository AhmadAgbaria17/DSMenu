import { getTakeawayQr } from '@/lib/services/takeaway-qr';
import { requireStaffSession } from '@/lib/staff-context';
import { getManagedTables } from '@/lib/services/tables';
import { QrCards } from '@/components/dashboard/qr-cards';
export default async function Page() { await requireStaffSession(); return <QrCards takeawayUrl={(await getTakeawayQr()).url} snapshot={await getManagedTables()} />; }
