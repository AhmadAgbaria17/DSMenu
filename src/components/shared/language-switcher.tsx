'use client';

import { useTransition, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLanguage } from '@/actions/locale';
import { languages } from '@/types/domain';

const labels = { ar: 'العربية', he: 'עברית', en: 'English' };
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('Common');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return <div>
    <nav aria-label={t('language')} className="flex flex-wrap gap-1 rounded-full border border-stone-200 bg-white p-1" dir="ltr">
      {languages.map(language => <button key={language} lang={language} type="button" aria-pressed={locale === language} disabled={pending}
        className={`min-h-11 rounded-full px-4 text-sm transition ${locale === language ? 'bg-emerald-950 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        onClick={() => startTransition(async () => { setError(false); try { await setLanguage(language); } catch { setError(true); } })}>{labels[language]}</button>)}
    </nav>
    {error && <p role="alert" className="text-sm text-red-800">{t('retry')}</p>}
  </div>;
}
