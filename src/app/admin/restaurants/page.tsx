import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdminPage } from '@/lib/platform-context';
import { listPlatformRestaurants } from '@/lib/services/platform';
import { RestaurantActivation } from '@/components/admin/restaurant-activation';
export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireSuperAdminPage(); const data = await listPlatformRestaurants(Number((await searchParams).page ?? 1)); const t = await getTranslations('Admin'); const locale = await getLocale();
  return <><h1 className="mb-6 text-3xl font-bold">{t('restaurants')}</h1><div className="space-y-4">{data.restaurants.map(r => <article data-testid={`admin-restaurant-${r.slug}`} key={r.id} className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border bg-white p-6"><div className="min-w-0 break-words"><h2 className="text-xl font-bold"><bdi>{r.name}</bdi></h2><p><bdi>{r.slug}</bdi></p><p className="mt-2 text-sm">{t('ownerEmail')}: <bdi>{r.ownerEmail ?? t('noOwner')}</bdi></p><p className="mt-2 text-sm">{t('createdAt')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(r.createdAt))}</p><p className="mt-2 font-bold">{t(r.isActive ? 'statusActive' : 'statusInactive')}</p></div><RestaurantActivation id={r.id} isActive={r.isActive} /></article>)}</div>{data.restaurants.length === 0 && <p>{t('empty')}</p>}<div className="mt-6 flex gap-5">{data.page > 1 && <Link className="min-h-12 p-3 underline" href={`/admin/restaurants?page=${data.page - 1}`}>{t('previous')}</Link>}{data.hasNext && <Link className="min-h-12 p-3 underline" href={`/admin/restaurants?page=${data.page + 1}`}>{t('next')}</Link>}</div></>;
}
