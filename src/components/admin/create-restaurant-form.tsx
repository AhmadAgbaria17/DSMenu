'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { onboardRestaurantSchema } from '@/lib/validators/platform';
const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4';
export function CreateRestaurantForm() {
  const t = useTranslations('Admin'); const password = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false); const [success, setSuccess] = useState(false);
  const [error, setError] = useState<'INVALID_REQUEST' | 'EMAIL_EXISTS' | 'SLUG_EXISTS' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE' | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget;
    const data = onboardRestaurantSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!data.success) { setError('INVALID_REQUEST'); return; }
    setPending(true); setError(null);
    try {
      const response = await fetch('/api/admin/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.data) });
      if (!response.ok) { const body = await response.json(); const code: unknown = body.error?.code; setError(code === 'EMAIL_EXISTS' || code === 'SLUG_EXISTS' || code === 'INVALID_REQUEST' || code === 'FORBIDDEN' ? code : 'SERVICE_UNAVAILABLE'); return; }
      form.reset(); setSuccess(true);
    } catch { setError('SERVICE_UNAVAILABLE'); }
    finally { if (password.current) password.current.value = ''; setPending(false); }
  }
  if (success) return <div role="status" className="rounded-2xl border bg-white p-6"><p className="font-bold">{t('created')}</p><Link className="mt-4 inline-block min-h-12 rounded-full border px-5 py-3" href="/admin/restaurants">{t('restaurants')}</Link></div>;
  return <form onSubmit={submit} aria-busy={pending} className="max-w-3xl space-y-6 rounded-2xl border bg-white p-6"><fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
    {(['name', 'slug', 'ownerName', 'ownerEmail'] as const).map(name => <label key={name}>{t(name)}<input className={inputClass} name={name} required maxLength={name === 'slug' ? 80 : name === 'ownerEmail' ? 254 : 160} type={name === 'ownerEmail' ? 'email' : 'text'} autoComplete="off" autoCapitalize={name === 'slug' || name === 'ownerEmail' ? 'none' : undefined} dir={name === 'slug' || name === 'ownerEmail' ? 'ltr' : undefined} pattern={name === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined} /></label>)}
    <div className="sm:col-span-2"><label htmlFor="platform-password">{t('password')}</label><input id="platform-password" ref={password} className={inputClass} type="password" name="password" autoComplete="new-password" dir="ltr" minLength={12} maxLength={72} required aria-describedby="password-policy" /><span id="password-policy" className="mt-2 block text-sm text-stone-600">{t('passwordHint')}</span></div>
    <label>{t('defaultLanguage')}<input readOnly className={inputClass} value={t('arabic')} /></label><label>{t('currency')}<input readOnly className={inputClass} value="ILS" /></label>
    <label className="sm:col-span-2">{t('enabledLanguages')}<input readOnly className={inputClass} value={t('languages')} /></label>
  </fieldset><p className="text-sm text-stone-600">{t('settingsHint')}</p>{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{t(error)}</p>}<button type="submit" disabled={pending} className="min-h-12 rounded-full bg-emerald-950 px-7 font-bold text-white disabled:opacity-50">{t(pending ? 'pending' : 'create')}</button></form>;
}
