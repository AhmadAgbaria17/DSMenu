import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireSuperAdminPage } from '@/lib/platform-context';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { LogoutButton } from '@/components/auth/logout-button';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { title: 'DSMenu Admin', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage(); const t = await getTranslations('Admin');
  return <div className="min-h-dvh"><header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-5"><Link className="text-xl font-black" href="/admin">DSMenu / {t('title')}</Link><div className="flex flex-wrap items-center gap-3"><LanguageSwitcher /><LogoutButton /></div></header><nav aria-label={t('title')} className="mx-auto flex max-w-6xl flex-wrap gap-3 p-5">{([['/admin', 'overview'], ['/admin/restaurants', 'restaurants'], ['/admin/restaurants/new', 'createRestaurant']] as const).map(([href, label]) => <Link className="min-h-12 rounded-full border bg-white px-5 py-3 font-bold" key={href} href={href}>{t(label)}</Link>)}</nav><main className="mx-auto max-w-6xl p-5 pb-16">{children}</main></div>;
}
