import Image from 'next/image';
import QRCode from 'qrcode';
import { getTranslations } from 'next-intl/server';
import { requireStaffSession } from '@/lib/staff-context';
import { getTakeawayQr } from '@/lib/services/takeaway-qr';
import { PrintButton } from '@/components/dashboard/print-button';
import '../print/print.css';
export default async function Page() {
  await requireStaffSession(); const qr = await getTakeawayQr(); const t = await getTranslations('Takeaway');
  const image = await QRCode.toDataURL(qr.url, { width: 768, margin: 4, errorCorrectionLevel: 'M' });
  return <div className="qr-print-root"><div className="mb-6 print:hidden"><PrintButton /></div><div className="qr-print-grid"><article className="qr-print-card"><h1 className="text-3xl font-bold">{qr.name}</h1><h2 className="my-4 text-2xl font-bold">{t('title')}</h2><p>{t('hint')}</p><Image unoptimized loading="eager" src={image} alt={t('qr')} width={320} height={320} className="qr-print-image mx-auto" /><p dir="ltr" className="break-all text-sm">{qr.url}</p></article></div></div>;
}
