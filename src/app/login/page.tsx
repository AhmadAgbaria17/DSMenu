import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Staff login', robots: { index: false, follow: false } };
export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect(session.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard');
  const t = await getTranslations('StaffAuth');
  return <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-6 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-5"><Link href="/" className="text-xl font-black tracking-tight"><bdi dir="ltr">DSMenu<span className="text-amber-700">.</span></bdi></Link><LanguageSwitcher /></header>
    <section className="my-auto grid items-center gap-12 py-14 md:grid-cols-2 md:gap-20">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">{t('eyebrow')}</p><h1 className="mt-5 max-w-lg text-4xl font-bold leading-tight sm:text-5xl">{t('title')}</h1><p className="mt-6 max-w-md text-lg leading-8 text-stone-600">{t('description')}</p></div>
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-9"><h2 className="text-2xl font-bold">{t('login')}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{t('accountHint')}</p><LoginForm /></div>
    </section>
    <p className="text-center text-xs text-stone-500">DSMenu · {t('footer')}</p>
  </main>;
}
