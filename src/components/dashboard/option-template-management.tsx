'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OptionGroup } from '@/lib/product-options';
import { templatePayload, type OptionTemplate } from '@/lib/option-templates';
import { OptionsEditor } from './options-editor';
import { templateRequest } from './template-actions';
import { Sheet } from '@/components/shared/sheet';
import { actionClass, inputClass } from './menu-fields';

export function OptionTemplateManagement({ initial }: { initial: OptionTemplate[] }) {
  const t = useTranslations('Templates'); const m = useTranslations('Management');
  const [rows, setRows] = useState(initial); const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<OptionTemplate | null>(null);
  const [pending, setPending] = useState(false); const busy = useRef(false);
  const [message, setMessage] = useState<'saved' | 'failed' | null>(null);
  async function mutate(path: string, method: string, body?: unknown) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    try { await templateRequest(path, method, body); setRows(await templateRequest<OptionTemplate[]>('')); setEditing(null); setMessage('saved'); }
    catch { setMessage('failed'); } finally { busy.current = false; setPending(false); }
  }
  const start = () => setEditing({ id: '', templateName: '', isActive: true, group: { id: crypto.randomUUID(), nameAr: '', nameHe: '', nameEn: '', type: 'MULTIPLE', required: false, minSelections: 0, maxSelections: 20, sortOrder: 0, isActive: true, options: [] } });
  const feedback = message && <p role={message === 'saved' ? 'status' : 'alert'} className="my-4 rounded-xl bg-amber-50 p-4">{t(message)}</p>;
  return <>
    <Link href="/dashboard/products" className="inline-block min-h-12 underline">{m('products')}</Link>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">{t('title')}</h1><button type="button" className={actionClass} disabled={pending} onClick={start}>{t('create')}</button></div>
    <p className="mb-5 text-stone-600">{t('hint')}</p>
    <label>{t('search')}<input className={inputClass} type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {!editing && feedback}
    <div className="mt-5 grid gap-4 md:grid-cols-2">{rows.filter(row => row.templateName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(row => <article key={row.id} data-testid={'template-' + row.id} className="min-w-0 rounded-2xl border bg-white p-5">
      <h2 className="break-words text-xl font-bold">{row.templateName}</h2><p>{m(row.isActive ? 'active' : 'inactive')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={actionClass} disabled={pending} onClick={() => { setMessage(null); setEditing(row); }}>{t('edit')}</button>
        <button type="button" className={actionClass} disabled={pending} onClick={() => { const name = window.prompt(t('name'), row.templateName); if (name?.trim()) void mutate('/' + row.id, 'POST', { templateName: name }); }}>{t('duplicate')}</button>
        <button type="button" className={actionClass} disabled={pending} onClick={() => void mutate('/' + row.id, 'PUT', { templateName: row.templateName, group: row.group, isActive: !row.isActive })}>{t(row.isActive ? 'deactivate' : 'activate')}</button>
        <button type="button" className="min-h-12 rounded-full border px-5 text-red-800" disabled={pending} onClick={() => { if (window.confirm(t('deleteConfirm'))) void mutate('/' + row.id, 'DELETE'); }}>{t('delete')}</button>
      </div>
    </article>)}</div>
    {!rows.some(row => row.templateName.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p className="py-8">{t('empty')}</p>}
    {editing && <Sheet title={t(editing.id ? 'edit' : 'create')} onClose={() => { if (!pending) setEditing(null); }}><div className="p-5">{feedback}<TemplateEditor key={editing.id} value={editing} pending={pending} save={body => mutate(editing.id ? '/' + editing.id : '', editing.id ? 'PUT' : 'POST', body)} /></div></Sheet>}
  </>;
}
function TemplateEditor({ value, pending, save }: { value: OptionTemplate; pending: boolean; save: (body: unknown) => Promise<void> }) {
  const t = useTranslations('Templates'); const m = useTranslations('Management');
  const [groups, setGroups] = useState<OptionGroup[]>([value.group]); const [name, setName] = useState(value.templateName);
  const payload = { templateName: name, isActive: value.isActive, group: groups[0] };
  const valid = templatePayload.safeParse(payload).success;
  return <form className="space-y-5" aria-busy={pending} onSubmit={e => { e.preventDefault(); if (valid) void save(payload); }}>
    <label>{t('name')}<input className={inputClass} required maxLength={120} value={name} disabled={pending} onChange={e => setName(e.target.value)} /></label>
    <OptionsEditor groups={groups} onChange={setGroups} disabled={pending} singleGroup />
    {!valid && <p role="alert">{t('invalid')}</p>}
    <button className={actionClass} disabled={!valid || pending}>{m(pending ? 'saving' : 'save')}</button>
  </form>;
}
