import { TakeawayEntry } from '@/components/menu/takeaway-entry';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPublicRestaurant } from '@/lib/services/restaurant';
import { RestaurantHeader } from '@/components/menu/restaurant-header';
import { MenuBrowser } from '@/components/menu/menu-browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function RestaurantPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string | string[]; mode?: string | string[] }>;
}) {
  const [{ slug }, query, t] = await Promise.all([params, searchParams, getTranslations('Menu')]);
  const takeaway = query.mode === 'takeaway' && query.table === undefined;
  if (query.mode !== undefined && !takeaway) notFound();
  const data = await getPublicRestaurant(slug, query.table);
  if (!data) notFound();
  const { restaurant, table, tables, invalidTable, categories, products } = data;

  return <main className="mx-auto max-w-6xl px-5 pb-32 sm:px-8">
    <RestaurantHeader restaurant={restaurant} table={table} />
    {invalidTable ? <p role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">{t('invalidTable')}</p>
      : !takeaway && !table && <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6" aria-labelledby="choose-table">
        <h2 id="choose-table" className="text-xl font-bold">{t('chooseTable')}</h2><p className="mt-2 text-stone-600">{tables.length ? t('chooseHint') : t('noTables')}</p>
        <div className="mt-4 flex flex-wrap gap-2">{tables.map(item => <Link key={item.id} href={`/r/${restaurant.slug}?table=${item.tableNumber}`} className="inline-flex min-h-12 items-center rounded-xl border border-stone-200 px-4 hover:bg-stone-100">{t('table', { number: item.tableNumber })}</Link>)}</div>
      </section>}
    {takeaway ? <TakeawayEntry restaurant={restaurant} table={null} categories={categories} products={products} /> : <MenuBrowser key={`${restaurant.id}:${table?.tableNumber ?? 'none'}`} restaurant={restaurant} table={table} categories={categories} products={products} />}
    <footer className="mt-12 border-t border-stone-200 pt-7 text-center text-sm text-stone-500"><p>{t('allergens')}</p><p className="mt-4" dir="ltr">DSMenu · <bdi>{restaurant.name}</bdi></p></footer>
  </main>;
}
