import { requireStaffSession } from '@/lib/staff-context';
import { ServiceCalls } from '@/components/dashboard/service-calls';
export default async function ServiceCallsPage() { await requireStaffSession(); return <ServiceCalls />; }
