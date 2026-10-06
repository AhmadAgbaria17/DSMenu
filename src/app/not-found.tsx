import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
export default async function NotFound() {
  const t = await getTranslations('Errors');
  const common = await getTranslations('Common');
  return <main className="mx-auto max-w-xl px-6 py-24"><p className="text-amber-800">404</p><h1 className="mt-4 text-3xl font-bold">{t('notFound')}</h1><p className="my-6 text-stone-600">{t('notFoundDescription')}</p><Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-emerald-950 px-6 text-white">{common('home')}</Link></main>;
}
