'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { actionClass } from './menu-fields';
import type { TableSnapshot } from '@/types/tables';
export function QrCards({ snapshot, takeawayUrl }: { snapshot: TableSnapshot; takeawayUrl: string }) {
  const takeaway = useTranslations('Takeaway'); const t = useTranslations('Tables'); const [message, setMessage] = useState('');
  const tables = snapshot.tables.filter(table => table.isActive);
  return <><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">{t('qrTitle')}</h1>{tables.length > 0 && <Link className={actionClass} href="/dashboard/qr-codes/print" target="_blank">{t('printAll')}</Link>}</div><p className="mb-5">{t('qrHint')}</p>{message && <p role="status" className="my-4">{t(message)}</p>}
    <section data-testid="takeaway-qr" className="mb-8 rounded-2xl border border-amber-300 bg-white p-5"><h2 className="text-2xl font-bold">{takeaway('qr')}</h2><Image unoptimized width={256} height={256} src="/api/dashboard/takeaway/qr" alt={takeaway('qr')} className="my-4" /><p dir="ltr" className="break-all text-sm">{takeawayUrl}</p><div className="mt-4 flex flex-wrap gap-2"><a className={actionClass} href="/api/dashboard/takeaway/qr" download>{t('download')}</a><Link className={actionClass} href="/dashboard/qr-codes/takeaway" target="_blank">{t('print')}</Link><button className={actionClass} onClick={async () => { try { await navigator.clipboard.writeText(takeawayUrl); setMessage('copied'); } catch { setMessage('copyFailed'); } }}>{t('copy')}</button></div></section>
    {!tables.length && <p>{t('empty')}</p>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{tables.map(table => <article id={`table-${table.tableNumber}`} key={table.id} className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">{t('table', { number: table.tableNumber })}</h2><p>{table.label}</p>
      <Image unoptimized width={256} height={256} src={`/api/dashboard/tables/${table.id}/qr`} alt={t('qrAlt', { number: table.tableNumber })} className="mx-auto my-4 aspect-square" />
      <p dir="ltr" className="break-all text-sm" data-testid="qr-url">{table.qrUrl}</p>
      <div className="mt-4 flex flex-wrap gap-2"><a className={actionClass} href={`/api/dashboard/tables/${table.id}/qr`} download>{t('download')}</a><Link className={actionClass} href={`/dashboard/qr-codes/print?table=${table.id}`} target="_blank">{t('print')}</Link><button className={actionClass} onClick={async () => { try { await navigator.clipboard.writeText(table.qrUrl); setMessage('copied'); } catch { setMessage('copyFailed'); } }}>{t('copy')}</button></div>
    </article>)}</div></>;
}
