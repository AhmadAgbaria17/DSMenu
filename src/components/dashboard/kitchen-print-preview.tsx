'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { KitchenTicket } from '@/types/kitchen-ticket';
import type { KitchenPrintMetadata } from '@/lib/kitchen-print';
import { KitchenTicketContent } from './kitchen-ticket';

export function KitchenPrintPreview({ initial }: { initial: KitchenTicket }) {
  const t = useTranslations('Kitchen');
  const [ticket, setTicket] = useState(initial);
  const [width, setWidth] = useState<'80' | '58'>('80');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'failed' | 'conflict' | 'unavailable' | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const busy = useRef(false);
  // Preserve an uncertain attempt across network retries; reprints get new IDs.
  const attempt = useRef<{ requestId: string; expectedCount: number } | null>(null);
  const endpoint = `/api/dashboard/kitchen-print/${ticket.unit.kind}/${ticket.unit.id}`;
  async function print() {
    if (busy.current || unavailable) return;
    busy.current = true; setPending(true); setError(null);
    attempt.current ??= { requestId: crypto.randomUUID(), expectedCount: ticket.print.count };
    try {
      await document.fonts.ready;
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current), signal: AbortSignal.timeout(15_000) });
      if (response.status === 409) {
        const fresh = await fetch(endpoint, { cache: 'no-store' });
        if (fresh.ok) { setTicket(await fresh.json() as KitchenTicket); setError('conflict'); }
        else { setUnavailable(true); setError('unavailable'); }
        attempt.current = null; return;
      }
      if (response.status === 401 || response.status === 404) { setUnavailable(true); setError('unavailable'); return; }
      if (!response.ok) throw new Error('Print action unavailable');
      const state = await response.json() as KitchenPrintMetadata;
      setTicket(previous => ({ ...previous, print: state })); attempt.current = null;
      if ('BroadcastChannel' in window) {
        try {
          const channel = new BroadcastChannel('dsmenu-kitchen-print');
          channel.postMessage({ restaurantId: ticket.restaurantId }); channel.close();
        } catch { /* Focus/periodic revalidation still updates Live Orders. */ }
      }
      // Browser dialog initiation is best-effort; cancellation/hardware output
      // cannot be detected reliably. The stored count is not a paper receipt.
      window.print();
    } catch { setError('failed'); }
    finally { busy.current = false; setPending(false); }
  }
  return <main className="kitchen-print-page" data-paper-width={width}>
    <div className="kitchen-print-controls" aria-busy={pending}>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="my-3">{t('hint')}</p>
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="kitchen-paper-width" className="font-bold">{t('paperWidth')}</label><select id="kitchen-paper-width" value={width} onChange={event => setWidth(event.target.value as '80' | '58')} disabled={pending} className="min-h-12 rounded-lg border bg-white px-3"><option value="80">80 mm</option><option value="58">58 mm</option></select></div>
      <div className="my-4 flex flex-wrap items-center gap-4">
        <button type="button" disabled={pending || unavailable} onClick={() => void print()} className="min-h-14 rounded-xl bg-emerald-950 px-6 font-bold text-white disabled:opacity-50">{t(pending ? 'opening' : ticket.print.count ? 'reprint' : 'print')}</button>
        <Link href="/dashboard/orders" className="min-h-12 px-3 py-3 underline">{t('back')}</Link>
        {ticket.print.count > 0 && <span role="status" className="font-bold">{t('printed', { count: ticket.print.count })}</span>}
      </div>
      <p className="text-sm">{t('limitation')}</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 p-3">{t(error)}</p>}
    </div>
    <KitchenTicketContent ticket={ticket} />
  </main>;
}
