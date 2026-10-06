'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { dashboardNavigation } from '@/lib/dashboard-navigation';

export function DashboardNavigation() {
  const pathname = usePathname();
  const t = useTranslations('Dashboard');
  return <nav aria-label={t('navigation')} className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
    {dashboardNavigation.map(section => {
      const href = section === 'overview' ? '/dashboard' : `/dashboard/${section}`;
      const active = pathname === href;
      return <Link key={section} href={href} prefetch={false} aria-current={active ? 'page' : undefined} className={`flex min-h-12 shrink-0 items-center rounded-xl px-4 text-sm font-bold transition ${active ? 'bg-emerald-950 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{t(`nav.${section}`)}</Link>;
    })}
  </nav>;
}
