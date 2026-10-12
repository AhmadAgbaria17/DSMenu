'use client';
import { groupManagedProducts } from '@/lib/managed-product-groups';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { localizedName } from '@/i18n/config';
import { MenuImage } from '@/components/menu/menu-image';
import { Sheet } from '@/components/shared/sheet';
import { MenuEditor } from './menu-editor';
import { ImageUpload } from './image-upload';
import { actionClass } from './menu-fields';
import type { ManagedMenu, ManagedProduct } from '@/types/menu-management';
export function MenuManagement({ initial, mode }: { initial: ManagedMenu; mode: 'categories' | 'products' }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const grid = useTranslations('ProductGrid');
  const [archived, setArchived] = useState(false);
  const busy = useRef(false);
  const router = useRouter(); const locale = useLocale(); const t = useTranslations('Management');
  const rows = mode === 'categories' ? snapshot.categories : snapshot.products.filter(p => p.isArchived === archived);
  const category = snapshot.categories.find(c => c.id === editing);
  const product = snapshot.products.find(p => p.id === editing);
  async function reload() {
    const response = await fetch('/api/dashboard/menu', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Unavailable');
    setSnapshot(await response.json() as ManagedMenu);
  }
  async function mutate(data: Record<string, unknown>, id?: string, flags = false) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    try {
      const response = await fetch(`/api/dashboard/${mode}${id ? `/${id}` : ''}`, { method: !id ? 'POST' : mode === 'categories' || flags ? 'PATCH' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) { router.replace('/login'); router.refresh(); }
      if (!response.ok) { setMessage(response.status === 400 ? 'invalid' : 'failed'); return; }
      const result = await response.json() as { id: string };
      await reload(); if (!flags) setEditing(result.id); setMessage('saved');
    } catch { setMessage('failed'); }
    finally { busy.current = false; setPending(false); }
  }
  const groups = groupManagedProducts(snapshot.categories, snapshot.products.filter(p => p.isArchived === archived), query, locale);
  const renderRow = (row: (typeof rows)[number]) => <article key={row.id} data-testid={`managed-${row.id}`} className={mode === 'products' ? 'min-w-0 rounded-2xl border border-stone-200 bg-white p-4' : 'flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5'}><MenuImage image={row.image} alt={localizedName(row, locale)} className={mode === 'products' ? 'mb-4 h-36 w-full rounded-xl' : 'size-20 shrink-0 rounded-xl'} /><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-bold">{localizedName(row, locale)}</h2><p className="mt-1 text-sm text-stone-600">{t('sortOrder')}: {row.sortOrder}</p>{'price' in row ? <><p className="mt-1">{new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(row.price / 100)}</p><p className="text-sm text-stone-500">{snapshot.categories.find(c => c.id === row.categoryId) ? localizedName(snapshot.categories.find(c => c.id === row.categoryId)!, locale) : t('chooseCategory')}</p>{(row.optionGroups ?? []).length > 0 && <p className="mt-2 text-sm font-bold text-emerald-800">{grid('options', { count: (row.optionGroups ?? []).length })}</p>}</> : <p className="mt-1 text-sm">{t(row.isActive ? 'active' : 'inactive')}</p>}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="min-h-12 rounded-xl border px-5 font-bold" onClick={() => { setEditing(row.id); setMessage(null); }}>{t('edit')}</button>{'price' in row && <><button type="button" disabled={pending} aria-pressed={row.isAvailable} onClick={() => void mutate({ isAvailable: !row.isAvailable }, row.id, true)} className="min-h-12 rounded-xl bg-emerald-50 px-4 font-bold">{t(row.isAvailable ? 'available' : 'unavailable')}</button><button type="button" disabled={pending} aria-pressed={row.isFeatured} onClick={() => void mutate({ isFeatured: !row.isFeatured }, row.id, true)} className={`min-h-12 rounded-xl border px-4 font-bold ${row.isFeatured ? 'border-amber-300 bg-amber-100 text-amber-950' : 'border-stone-200 bg-white text-stone-600'}`}>{t('isFeatured')}</button><button type="button" disabled={pending} onClick={() => { if (window.confirm(t('archiveConfirm'))) void mutate({ isArchived: !(row as ManagedProduct).isArchived }, row.id, true); }} className="min-h-12 rounded-xl border px-4 font-bold text-red-800">{t(row.isArchived ? 'restore' : 'archive')}</button></>}</div></article>;
  const feedback = message && <p role={message === 'saved' ? 'status' : 'alert'} className="my-4 rounded-xl bg-amber-50 p-4">{t(message)}</p>;
  return <>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">{t(mode)}</h1><button type="button" className={actionClass} onClick={() => { setEditing('new'); setMessage(null); }}>{t(mode === 'categories' ? 'addCategory' : 'addProduct')}</button></div>
    <p className="mb-5 text-sm text-stone-600">{t(mode === 'categories' ? 'categoryHint' : 'productHint')}</p>
    {mode === 'products' && <button type="button" aria-pressed={archived} onClick={() => setArchived(!archived)} className="mb-5 min-h-12 rounded-xl border bg-white px-5 font-bold">{t(archived ? 'showCurrent' : 'showArchived')}</button>}
    {!editing && feedback}
    {!rows.length && <p className="rounded-2xl border border-dashed p-8 text-center">{t('empty')}</p>}
    {mode === 'categories' ? <div className="space-y-4">{rows.map(renderRow)}</div> : <>
      <label className="mb-5 block font-bold">{grid('search')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border bg-white px-4" /></label>
      <nav aria-label={grid('categories')} className="mb-6 flex flex-wrap gap-2">{[{ id: 'all', label: grid('all') }, ...groups.map(group => ({ id: group.id, label: group.category ? localizedName(group.category, locale) : grid('uncategorized') }))].map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-12 rounded-full border px-4 font-bold ${filter === item.id ? 'bg-emerald-950 text-white' : 'bg-white'}`}>{item.label}</button>)}</nav>
      <div className="space-y-9">{groups.filter(group => filter === 'all' || filter === group.id).map(group => <section key={group.id} data-testid={`product-category-${group.id}`}><h2 className="mb-2 text-2xl font-bold">{group.category ? localizedName(group.category, locale) : grid('uncategorized')}</h2><p className="mb-4 text-sm text-stone-600">{grid('count', { count: group.products.length })}</p>{!group.category && <p role="alert" className="mb-4 text-amber-900">{grid('repair')}</p>}<div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 xl:grid-cols-3">{group.products.map(renderRow)}</div></section>)}</div>
      {!groups.some(group => (filter === 'all' || group.id === filter) && group.products.length) && <p className="py-6">{grid('empty')}</p>}
    </>}
    {editing && <Sheet title={t(mode === 'categories' ? 'categoryEditor' : 'productEditor')} onClose={() => { if (!pending) setEditing(null); }}><div className="p-5 sm:p-7">{feedback}<MenuEditor key={editing} mode={mode} category={category} product={product} categories={snapshot.categories} pending={pending} save={data => mutate(data, editing === 'new' ? undefined : editing)} />{editing !== 'new' && <ImageUpload kind={mode} id={editing} image={(mode === 'categories' ? category : product)?.image ?? null} onChanged={reload} />}{editing === 'new' && <p className="mt-5 text-sm text-stone-500">{t('saveBeforeImage')}</p>}</div></Sheet>}
  </>;
}
