'use client';
import { useTranslations } from 'next-intl';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors');
  const common = useTranslations('Common');
  return <main className="mx-auto max-w-xl px-6 py-24"><h1 className="text-3xl font-bold">{t('title')}</h1><p className="my-6 text-stone-600">{t('description')}</p><button onClick={reset} className="min-h-12 rounded-full bg-emerald-950 px-6 text-white">{common('retry')}</button></main>;
}
