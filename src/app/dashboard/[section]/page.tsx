import { notFound } from 'next/navigation';
import { requireStaffSession } from '@/lib/staff-context';

export default async function DashboardSection() {
  await requireStaffSession();
  notFound();
}
