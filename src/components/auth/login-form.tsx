'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { loginSchema } from '@/lib/validators/staff';

export function LoginForm() {
  const t = useTranslations('StaffAuth');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'invalid' | 'fields' | 'unavailable' | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) { setError('fields'); return; }
    setPending(true); setError(null);
    try {
      const result = await signIn('credentials', { ...parsed.data, redirect: false, redirectTo: '/dashboard' });
      if (result?.error || !result?.ok) { setError('invalid'); setPending(false); return; }
      router.replace('/dashboard');
      router.refresh();
    } catch { setError('unavailable'); setPending(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-6" aria-busy={pending}>
    <div><label htmlFor="staff-email" className="mb-2 block text-sm font-bold">{t('email')}</label><input id="staff-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" required maxLength={254} disabled={pending} aria-describedby={error ? 'login-error' : undefined} className="min-h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-base" /></div>
    <div><label htmlFor="staff-password" className="mb-2 block text-sm font-bold">{t('password')}</label><input id="staff-password" name="password" type="password" autoComplete="current-password" dir="ltr" required maxLength={72} disabled={pending} aria-describedby={error ? 'login-error' : undefined} className="min-h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-base" /></div>
    {error && <p id="login-error" role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{t(error)}</p>}
    <button type="submit" disabled={pending} className="min-h-14 w-full rounded-full bg-emerald-950 px-6 font-bold text-white">{t(pending ? 'pending' : 'login')}</button>
  </form>;
}
