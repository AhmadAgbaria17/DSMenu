'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OptionGroup } from '@/lib/product-options';
import { templatePayload, templateAlreadyAdded, type OptionTemplate } from '@/lib/option-templates';
import { inputClass } from './menu-fields';

export async function templateRequest<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/dashboard/option-templates' + path, {
    method, cache: 'no-store', signal: AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error('Template request failed');
  return await response.json() as T;
}
export function SaveGroupTemplate({ group, disabled }: { group: OptionGroup; disabled: boolean }) {
  const t = useTranslations('Templates');
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function save() {
    if (busy.current) return;
    const templateName = window.prompt(t('name'), group.nameEn);
    if (templateName === null) return;
    const parsed = templatePayload.safeParse({ templateName, isActive: true, group });
    if (!parsed.success) { setMessage('invalid'); return; }
    busy.current = true; setPending(true); setMessage(null);
    try { await templateRequest('', 'POST', parsed.data); setMessage('saved'); }
    catch { setMessage('failed'); } finally { busy.current = false; setPending(false); }
  }
  return <div><button type="button" disabled={disabled || pending} className="min-h-12 rounded-full border px-4 font-bold" onClick={() => void save()}>{t('saveAs')}</button>{message && <p role={message === 'saved' ? 'status' : 'alert'}>{t(message)}</p>}</div>;
}
export function TemplatePicker({ groups, onChange, disabled }: { groups: OptionGroup[]; onChange: (value: OptionGroup[]) => void; disabled: boolean }) {
  const t = useTranslations('Templates');
  const [rows, setRows] = useState<OptionTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<'added' | 'already' | 'failed' | null>(null);
  const busy = useRef(false);
  async function load() {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    try { setRows(await templateRequest('') as OptionTemplate[]); }
    catch { setMessage('failed'); } finally { busy.current = false; setPending(false); }
  }
  async function use(row: OptionTemplate) {
    if (busy.current || groups.length >= 10) return;
    if (templateAlreadyAdded(groups, row.id)) { setMessage('already'); return; }
    busy.current = true; setPending(true); setMessage(null);
    try {
      const result = await templateRequest('/' + row.id + '/use', 'POST') as { group: OptionGroup };
      onChange([...groups, { ...result.group, sortOrder: groups.length }]); setMessage('added');
    } catch { setMessage('failed'); } finally { busy.current = false; setPending(false); }
  }
  return <div className="mt-4 space-y-3" aria-busy={pending}>
    <button type="button" disabled={disabled || pending || groups.length >= 10} onClick={() => void load()} className="min-h-12 rounded-full border bg-white px-5 font-bold">{t('use')}</button>
    {rows && <div className="rounded-xl border bg-white p-4"><label>{t('search')}<input type="search" className={inputClass} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <ul className="mt-3 max-h-72 space-y-2 overflow-auto">{rows.filter(row => row.isActive && row.templateName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(row => <li key={row.id}><button type="button" disabled={disabled || pending || groups.length >= 10} className="min-h-12 w-full rounded-xl border px-4 text-start" onClick={() => void use(row)}>{row.templateName}{templateAlreadyAdded(groups, row.id) ? ' — ' + t('already') : ''}</button></li>)}</ul>
      {!rows.some(row => row.isActive && row.templateName.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>{t('empty')}</p>}
    </div>}
    {message && <p role={message === 'failed' ? 'alert' : 'status'}>{t(message)}</p>}
  </div>;
}
