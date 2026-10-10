'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
export function RestaurantActivation({ id, isActive }: { id: string; isActive: boolean }) {
  const t = useTranslations('Admin'); const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState(false);
  async function change() {
    if (pending || !window.confirm(t(isActive ? 'confirmDeactivate' : 'confirmActivate'))) return;
    setPending(true); setError(false);
    try { const response = await fetch(`/api/admin/restaurants/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) }); if (!response.ok) throw new Error(); router.refresh(); }
    catch { setError(true); } finally { setPending(false); }
  }
  return <div aria-busy={pending}><button type="button" disabled={pending} onClick={change} className="min-h-12 rounded-full border border-stone-300 px-6 font-bold disabled:opacity-50">{t(pending ? 'pending' : isActive ? 'deactivate' : 'activate')}</button>{error && <p role="alert" className="mt-2 text-red-800">{t('SERVICE_UNAVAILABLE')}</p>}</div>;
}
