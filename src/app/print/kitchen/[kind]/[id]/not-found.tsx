import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
export default async function NotFound() {
  const t = await getTranslations('Kitchen');
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">{t('title')}</h1><p className="my-5">{t('unavailable')}</p><Link className="inline-block min-h-12 rounded-xl border px-5 py-3" href="/dashboard/orders">{t('back')}</Link></main>;
}
