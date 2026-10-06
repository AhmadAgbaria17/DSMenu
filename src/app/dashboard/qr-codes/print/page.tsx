import Image from 'next/image';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffSession } from '@/lib/staff-context';
import { getManagedTables } from '@/lib/services/tables';
import { objectIdSchema } from '@/lib/validators/common';
import { PrintButton, PrintLogo } from '@/components/dashboard/print-button';
import './print.css';
export default async function Page({ searchParams }: { searchParams: Promise<{ table?: string | string[] }> }) {
  await requireStaffSession(); const { table } = await searchParams;
  if (table !== undefined && !objectIdSchema.safeParse(table).success) notFound();
  const snapshot = await getManagedTables(); const t = await getTranslations('Tables');
  const tables = snapshot.tables.filter(row => row.isActive && (!table || row.id === table));
  if (table && !tables.length) notFound();
  const cards = await Promise.all(tables.map(async row => ({ ...row, image: await QRCode.toDataURL(row.qrUrl, { width: 768, margin: 4, errorCorrectionLevel: 'M' }) })));
  return <div className="qr-print-root"><div className="mb-6 print:hidden"><h1 className="mb-4 text-3xl font-bold">{t('print')}</h1><p className="mb-4">{t('printHint')}</p><PrintButton /></div><div className="qr-print-grid">{cards.map(row => <article key={row.id} className="qr-print-card">
    {snapshot.restaurant.logo && <PrintLogo url={snapshot.restaurant.logo} />}
    <h2 className="text-3xl font-bold">{snapshot.restaurant.name}</h2><p className="my-3 text-2xl font-bold">{t('table', { number: row.tableNumber })}</p><p>{row.label}</p><p className="mt-4 text-lg">{t('scan')}</p>
    <Image unoptimized loading="eager" src={row.image} alt={t('qrAlt', { number: row.tableNumber })} width={320} height={320} className="qr-print-image mx-auto" />
    <p dir="ltr" className="break-all text-xs">{row.qrUrl}</p><p dir="ltr" className="mt-5"><bdi>العربية</bdi> | <bdi>עברית</bdi> | English</p>
  </article>)}</div></div>;
}
