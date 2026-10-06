import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import type { PublicRestaurant, PublicTable } from '@/types/menu';
import { MenuImage } from './menu-image';

export async function RestaurantHeader({ restaurant, table }: { restaurant: PublicRestaurant; table: PublicTable | null }) {
  const t = await getTranslations('Menu');
  const labels = await getTranslations('Management.settingsFields');
  return <>
    <header className="flex flex-wrap items-center justify-between gap-4 py-5">
      <Link href="/" className="text-xl font-bold tracking-tight" dir="ltr">DSMenu<span className="text-amber-700">.</span></Link>
      <LanguageSwitcher />
    </header>
    <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-stone-200/70">
      <div className="relative h-44 overflow-hidden bg-[#254b3e] sm:h-60" style={{ backgroundColor: restaurant.primaryColor }}>
        {restaurant.coverImage ? <MenuImage image={restaurant.coverImage} alt={restaurant.name} className="h-full w-full" priority />
          : <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#567465,transparent_70%)]"><div className="absolute -end-12 -top-28 size-96 rounded-full border-[45px] border-white/5" /><div className="absolute start-12 top-14 size-52 rounded-full border border-white/15" /></div>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/35 to-transparent px-6 pb-5 pt-16 sm:px-9"><p className="text-sm font-medium tracking-wide text-white">{t('eyebrow')}</p></div>
      </div>
      <div className="flex items-start gap-5 p-6 sm:p-9">
        {restaurant.logo ? <MenuImage image={restaurant.logo} alt={restaurant.name} className="size-20 shrink-0 rounded-2xl" />
          : <div aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#f0eddf] text-3xl font-bold sm:size-20"><bdi>{restaurant.name.slice(0, 1)}</bdi><span className="sr-only">{restaurant.name}</span></div>}
        <div className="min-w-0 flex-1"><h1 className="break-words text-4xl font-bold tracking-tight sm:text-5xl"><bdi>{restaurant.name}</bdi><span className="text-amber-700">.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600" dir="auto">{restaurant.description || t('subtitle')}</p>
          {restaurant.address && <p className="mt-2 text-sm text-stone-600" dir="auto">{restaurant.address}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-sm">{restaurant.phone && <span><span>{labels('phone')}: </span><bdi>{restaurant.phone}</bdi></span>}{restaurant.whatsapp && <span><span>{labels('whatsapp')}: </span><bdi>{restaurant.whatsapp}</bdi></span>}{restaurant.googleMapsUrl && <a href={restaurant.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="underline">{labels('googleMapsUrl')}</a>}{restaurant.instagramUrl && <a href={restaurant.instagramUrl} target="_blank" rel="noopener noreferrer" className="underline">{labels('instagramUrl')}</a>}</div>
          {table && <div data-testid="detected-table" className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-900"><span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" /><span>{t('detected')} <strong>{t('table', { number: table.tableNumber })}</strong></span></div>}
        </div>
      </div>
    </section>
  </>;
}
