import { getTranslations } from 'next-intl/server';
export default async function Loading() {
  const t = await getTranslations('Common');
  return <main aria-busy="true" aria-live="polite" className="mx-auto max-w-6xl space-y-6 p-8">
    <p>{t('loading')}</p>
    <div className="h-72 animate-pulse rounded-3xl bg-stone-200" />
    <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map(n => <div key={n} className="h-44 animate-pulse rounded-2xl bg-stone-200" />)}</div>
    </main>;
}
