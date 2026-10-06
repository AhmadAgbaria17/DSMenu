import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffSession } from '@/lib/staff-context';
import { getDashboardRestaurant } from '@/lib/services/dashboard';
import { DashboardNavigation } from '@/components/dashboard/navigation';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { LogoutButton } from '@/components/auth/logout-button';
import { ActivityProvider, ActivityControls } from '@/components/dashboard/activity-provider';
import { getRestaurantServices } from '@/lib/services/staff-services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { title: 'Dashboard', robots: { index: false, follow: false } };
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffSession();
  const restaurant = await getDashboardRestaurant();
  const t = await getTranslations('Dashboard');
  const services = await getRestaurantServices();
  return <ActivityProvider initial={services} restaurantId={staff.restaurantId}><div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
    <aside className="min-w-0 border-b border-stone-200 bg-white px-4 py-5 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-e md:border-b-0 md:p-5">
      <Link href="/dashboard" className="block px-3 text-2xl font-black tracking-tight"><bdi dir="ltr">DSMenu<span className="text-amber-700">.</span></bdi></Link>
      <div className="my-5 rounded-2xl bg-stone-50 p-4"><p className="text-xs text-stone-500">{t('restaurant')}</p><p className="mt-1 break-words text-lg font-bold" data-testid="dashboard-restaurant"><bdi>{restaurant.name}</bdi></p></div>
      <DashboardNavigation />
    </aside>
    <div className="min-w-0"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white/80 px-5 py-5 lg:px-10"><div><p className="text-sm font-bold"><bdi>{staff.name}</bdi></p><p className="mt-1 text-xs text-stone-500">{t('workspace')}</p></div><div className="flex flex-wrap items-center gap-3"><ActivityControls /><LanguageSwitcher /><LogoutButton /></div></header><main className="mx-auto max-w-6xl px-5 py-8 lg:px-10 lg:py-12">{children}</main></div>
  </div></ActivityProvider>;
}
