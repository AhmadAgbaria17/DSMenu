'use client';
import { useTranslations } from 'next-intl';
export default function AnalyticsError({ reset }: { reset: () => void }) {
  const t = useTranslations('Analytics'); const common = useTranslations('Common');
  return <section><h1 className="text-3xl font-bold">{t('title')}</h1><p role="alert" className="my-6">{t('failed')}</p><button className="min-h-12 rounded-xl bg-emerald-950 px-6 text-white" onClick={reset}>{common('retry')}</button></section>;
}
