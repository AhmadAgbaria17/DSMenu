'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { inputClass, actionClass } from './menu-fields';
import { ImageUpload } from './image-upload';
import type { ManagedMenu } from '@/types/menu-management';
const fields = ['name', 'description', 'phone', 'whatsapp', 'address', 'googleMapsUrl', 'instagramUrl', 'primaryColor'] as const;
export function RestaurantSettings({ initial }: { initial: ManagedMenu }) {
  const [restaurant, setRestaurant] = useState(initial.restaurant);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const security = useTranslations('TableAccess');
  const kitchen = useTranslations('Kitchen');
  const busy = useRef(false); const t = useTranslations('Management'); const router = useRouter();
  async function reload() { const response = await fetch('/api/dashboard/menu', { cache: 'no-store', signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error('Unavailable'); setRestaurant((await response.json() as ManagedMenu).restaurant); }
  async function save(form: HTMLFormElement) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    try {
      const values = new FormData(form);
      const response = await fetch('/api/dashboard/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(fields.map(field => [field, values.get(field)])), tableAccessCodeEnabled: values.has('tableAccessCodeEnabled'), kitchenPrintingEnabled: values.has('kitchenPrintingEnabled') }), signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) router.replace('/login');
      if (!response.ok) { setMessage(response.status === 400 ? 'invalid' : 'failed'); return; }
      await reload(); setMessage('saved'); router.refresh();
    } catch { setMessage('failed'); }
    finally { busy.current = false; setPending(false); }
  }
  return <><h1 className="mb-7 text-3xl font-bold">{t('settings')}</h1>{message && <p role={message === 'saved' ? 'status' : 'alert'} className="mb-5 rounded-xl bg-amber-50 p-4">{t(message)}</p>}<form onSubmit={event => { event.preventDefault(); void save(event.currentTarget); }} aria-busy={pending} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5"><div className="grid gap-5 sm:grid-cols-2">{fields.map(field => <label key={field} className="block text-sm font-bold">{t(`settingsFields.${field}`)}{field === 'description' ? <textarea aria-label={t(`settingsFields.${field}`)} name={field} defaultValue={restaurant[field]} maxLength={2000} rows={4} className={inputClass} dir="auto" /> : <input aria-label={t(`settingsFields.${field}`)} name={field} defaultValue={restaurant[field]} required={field === 'name' || field === 'primaryColor'} type={field.endsWith('Url') ? 'url' : field === 'primaryColor' ? 'color' : 'text'} maxLength={field === 'name' ? 160 : field === 'address' ? 500 : field.endsWith('Url') ? 1000 : 60} className={inputClass} dir={['phone', 'whatsapp', 'primaryColor', 'googleMapsUrl', 'instagramUrl'].includes(field) ? 'ltr' : 'auto'} />}</label>)}</div><section className="rounded-xl border border-stone-200 p-5"><h2 className="mb-4 text-xl font-bold">{kitchen('settingsTitle')}</h2><label className="flex min-h-12 items-center gap-3 font-bold"><input type="checkbox" name="kitchenPrintingEnabled" defaultChecked={restaurant.kitchenPrintingEnabled} className="size-5" aria-describedby="kitchen-printing-hint" />{kitchen('enablePrinting')}</label><p id="kitchen-printing-hint" className="mt-2 text-sm text-stone-600">{kitchen('settingsHint')}</p></section><section className="rounded-xl border border-stone-200 p-5"><h2 className="mb-4 text-xl font-bold">{security('settingsTitle')}</h2><label className="flex min-h-12 items-center gap-3 font-bold"><input type="checkbox" name="tableAccessCodeEnabled" defaultChecked={restaurant.tableAccessCodeEnabled} className="size-5" aria-describedby="table-access-hint" />{security('enableCode')}</label><div id="table-access-hint" className="mt-2 space-y-2 text-sm text-stone-600"><p>{security('settingsHint')}</p><p>{security('enabledHint')}</p><p>{security('disabledHint')}</p><p>{security('newVisitsHint')}</p></div></section><button disabled={pending} type="submit" className={actionClass}>{t(pending ? 'saving' : 'save')}</button></form><div className="grid gap-5 lg:grid-cols-2"><ImageUpload kind="logo" id={restaurant.id} image={restaurant.logo} onChanged={reload} /><ImageUpload kind="coverImage" id={restaurant.id} image={restaurant.coverImage} onChanged={reload} /></div></>;
}
