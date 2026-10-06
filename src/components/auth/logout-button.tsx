'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export function LogoutButton() {
  const t = useTranslations('StaffAuth');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div><button type="button" disabled={pending} onClick={async () => {
    setPending(true); setError(false);
    try { await signOut({ redirectTo: '/login' }); }
    catch { setPending(false); setError(true); }
  }} className="min-h-12 rounded-full border border-stone-300 bg-white px-5 text-sm font-bold">{t(pending ? 'loggingOut' : 'logout')}</button>{error && <p role="alert" className="mt-2 text-sm text-red-800">{t('unavailable')}</p>}</div>;
}
