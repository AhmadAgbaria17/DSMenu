'use client';
import { useTranslations } from 'next-intl';
export default function AdminError({ reset }: { reset: () => void }) {
  const t = useTranslations('Admin');
  return <div role="alert" className="p-6"><p>{t('SERVICE_UNAVAILABLE')}</p><button className="mt-4 min-h-12 rounded-full border px-5" onClick={reset}>{t('retry')}</button></div>;
}
