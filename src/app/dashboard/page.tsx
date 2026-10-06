import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { getDashboardOverview, getDashboardRestaurant } from '@/lib/services/dashboard';
import { getTodayOrderSummary } from '@/lib/services/analytics';
import { formatMoney } from '@/lib/money';

export default async function OverviewPage() {
  const data = await getDashboardOverview();
  const restaurant = await getDashboardRestaurant();
  const t = await getTranslations('Dashboard');
  const analytics = await getTodayOrderSummary(); const a = await getTranslations('Analytics'); const locale = await getLocale();
  return <>
    <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">{t('workspace')}</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">{t('nav.overview')}</h1><p className="mt-4 max-w-2xl leading-7 text-stone-600">{t('summary')}</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data).map(([key, value]) => <article key={key} className="rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-sm font-medium text-stone-600">{t(`metrics.${key}`)}</h2><p data-testid={`metric-${key}`} className="mt-5 text-4xl font-bold tabular-nums">{value}</p></article>)}</div>
    <p className="mt-4 text-xs leading-6 text-stone-500">{t('snapshot')}</p>
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-bold">{a('today')}</h2><div className="my-5 grid gap-5 sm:grid-cols-2"><div><p className="text-sm text-stone-600">{a('orders')}</p><p data-testid="today-orders" className="mt-2 text-3xl font-bold">{analytics.orders}</p></div><div><p className="text-sm text-stone-600">{a('completedValue')}</p><p className="mt-2 text-3xl font-bold"><bdi>{formatMoney(analytics.completedValue, locale)}</bdi></p></div></div><p className="mb-4 text-sm leading-6 text-stone-600">{a('overviewHint')}</p><Link className="inline-flex min-h-12 items-center rounded-xl bg-emerald-950 px-6 font-bold text-white" href="/dashboard/analytics">{a('viewAnalytics')}</Link></section>
    <section className="mt-10 rounded-3xl bg-emerald-950 p-7 text-white sm:p-9"><h2 className="text-2xl font-bold">{t('menuTitle')}</h2><p className="mt-3 max-w-xl leading-7 text-emerald-100">{t('menuHint')}</p><Link href={`/r/${restaurant.slug}`} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-white px-6 text-sm font-bold text-emerald-950">{t('viewMenu')}</Link></section>
  </>;
}
