import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/shared/language-switcher';

export default async function Home() {
  const t = await getTranslations('Home');
  return <main className="mx-auto max-w-6xl px-6 py-8">
    <header className="flex flex-wrap items-center justify-between gap-5">
      <span className="text-2xl font-bold" dir="ltr">DSMenu
        <span className="text-amber-700">.</span>
      </span>
        <LanguageSwitcher />
      </header>
    <section className="py-24 md:py-40">
      <p className="mb-5 text-sm font-bold text-amber-800">{t('eyebrow')}</p>
      <h1 className="max-w-3xl text-5xl leading-tight font-bold md:text-7xl">{t('title')}</h1>
      <p className="mt-7 text-xl text-stone-600">{t('description')}</p>
      <Link href="/login" className="mt-10 inline-flex min-h-14 items-center rounded-full bg-emerald-950 px-7 font-bold text-white">{t('staffLogin')}</Link>
      </section>
  </main>;
}
