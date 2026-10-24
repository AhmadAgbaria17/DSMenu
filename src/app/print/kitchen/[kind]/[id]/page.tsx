import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffSession } from '@/lib/staff-context';
import { getKitchenTicket } from '@/lib/services/kitchen-print';
import { StaffApiError } from '@/lib/staff-http';
import { KitchenPrintPreview } from '@/components/dashboard/kitchen-print-preview';
import type { KitchenTicket } from '@/types/kitchen-ticket';
import './print.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const t = await getTranslations('Kitchen');
  return { title: t('title'), robots: { index: false, follow: false, noarchive: true } };
}
export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireStaffSession();
  let ticket: KitchenTicket;
  try { ticket = await getKitchenTicket(await params); }
  catch (error) {
    if (error instanceof StaffApiError && [400, 404, 409].includes(error.status)) notFound();
    throw error;
  }
  return <KitchenPrintPreview initial={ticket} />;
}
