'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MenuImage } from '@/components/menu/menu-image';
import type { ManagedImage } from '@/types/menu-management';
export function ImageUpload({ kind, id, image, onChanged }: { kind: 'products' | 'categories' | 'logo' | 'coverImage'; id: string; image: ManagedImage; onChanged: () => Promise<void> }) {
  const t = useTranslations('Management');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<'saved' | 'uploadFailed' | 'imageRules' | null>(null);
  const busy = useRef(false);
  async function mutate(file?: File) {
    if (busy.current) return;
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000 || !file.size)) { setMessage('imageRules'); return; }
    if (!file && !window.confirm(t('removeConfirm'))) return;
    busy.current = true; setPending(true); setMessage(null);
    try {
      const response = await fetch(`/api/dashboard/images/${kind}/${id}`, { method: file ? 'POST' : 'DELETE', ...(file ? { headers: { 'Content-Type': file.type }, body: file } : {}), signal: AbortSignal.timeout(55_000) });
      if (!response.ok) throw new Error('Upload failed');
      await onChanged(); setMessage('saved');
    } catch { setMessage('uploadFailed'); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5" aria-busy={pending}><h3 className="mb-4 font-bold">{t(kind === 'logo' || kind === 'coverImage' ? kind : 'image')}</h3><MenuImage image={image} alt={t('image')} className="h-36 w-48 max-w-full rounded-xl" /><p className="my-3 text-sm text-stone-600">{t('imageRules')}</p><label className="block text-sm font-bold">{t('upload')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void mutate(file); }} className="mt-2 block min-h-12 w-full max-w-full text-sm file:me-3 file:rounded-xl file:border-0 file:bg-emerald-950 file:px-4 file:py-3 file:text-white" /></label>{image && <button type="button" disabled={pending} onClick={() => void mutate()} className="mt-3 min-h-12 rounded-xl border border-red-200 px-5 font-bold text-red-800">{t('removeImage')}</button>}{pending && <p role="status" className="mt-3">{t('uploading')}</p>}{message && <p role={message === 'saved' ? 'status' : 'alert'} className="mt-3">{t(message)}</p>}</section>;
}
