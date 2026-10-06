import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffSession } from '@/lib/staff-context';
import { analyticsPresets, analyticsQuery } from '@/lib/analytics-range';
import { getAnalytics } from '@/lib/services/analytics';
import { AnalyticsReport } from '@/components/dashboard/analytics-report';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffSession(); const t = await getTranslations('Analytics');
  const query = analyticsQuery.safeParse(await searchParams);
  if (!query.success) return <><h1 className="text-3xl font-bold">{t('title')}</h1><p role="alert" className="my-6">{t('invalidRange')}</p><Link href="/dashboard/analytics" className="inline-flex min-h-12 items-center rounded-xl bg-emerald-950 px-6 text-white">{t('today')}</Link></>;
  const data = await getAnalytics(query.data);
  return <><h1 className="text-3xl font-bold">{t('title')}</h1><nav aria-label={t('dateRange')} className="my-6 flex flex-wrap gap-2">{analyticsPresets.map(range => <Link key={range} prefetch={false} href={`/dashboard/analytics?range=${range}`} aria-current={range === data.range.preset ? 'page' : undefined} className={`inline-flex min-h-12 items-center rounded-xl border px-5 font-bold ${range === data.range.preset ? 'bg-emerald-950 text-white' : 'bg-white text-stone-700'}`}>{t(range)}</Link>)}</nav><AnalyticsReport data={data} /></>;
}
