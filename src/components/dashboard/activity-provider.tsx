'use client';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import { useOrderSound } from '@/hooks/use-order-sound';
import { unseenServiceCalls } from '@/lib/service-flow';
import type { ServiceSnapshot } from '@/types/service-calls';
import type { ConnectionState } from '@/types/live-orders';
type Activity = { snapshot: ServiceSnapshot; refresh: (silent?: boolean) => Promise<void>; error: boolean; connection: ConnectionState; pulse: { number: number; silent: boolean }; sound: ReturnType<typeof useOrderSound> };
const Context = createContext<Activity | null>(null);
export function ActivityProvider({ initial, restaurantId, children }: { initial: ServiceSnapshot; restaurantId: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState(false);
  const [pulse, setPulse] = useState({ number: 0, silent: true });
  const sequence = useRef(0);
  const seen = useRef(new Set(initial.calls.map(call => call.id)));
  const sound = useOrderSound(restaurantId);
  const router = useRouter();
  async function refresh(silent = true) {
    const request = ++sequence.current;
    try {
      const response = await fetch('/api/dashboard/service-calls', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { setSnapshot({ ...initial, calls: [], realtime: null }); router.replace('/login'); router.refresh(); return; }
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json() as ServiceSnapshot;
      if (request !== sequence.current) return;
      const fresh = unseenServiceCalls(seen.current, data.calls, silent);
      setSnapshot(data); setError(false);
      if (fresh.length) sound.play();
    } catch { if (request === sequence.current) setError(true); }
  }
  const connection = useOrderRealtime(snapshot.realtime, '/api/dashboard/realtime', silent => {
    setPulse(previous => ({ number: previous.number + 1, silent }));
    void refresh(silent);
  });
  return <Context.Provider value={{ snapshot, refresh, error, connection, pulse, sound }}>{children}</Context.Provider>;
}
export function useActivity() { const context = useContext(Context); if (!context) throw new Error('ActivityProvider required'); return context; }
export function ActivityControls() {
  const { snapshot, sound } = useActivity();
  const t = useTranslations('LiveOrders');
  const service = useTranslations('Service');
  const count = snapshot.calls.filter(call => call.status !== 'RESOLVED').length;
  return <><Link href="/dashboard/service-calls" prefetch={false} className="min-h-12 rounded-full bg-amber-100 px-4 py-3 font-bold" aria-live="polite">{service('activeCount', { count })}</Link><button type="button" aria-label={t('sound')} aria-pressed={sound.state === 'on'} onClick={() => void sound.toggle()} className="min-h-12 rounded-full border border-stone-300 bg-white px-5 font-bold">{t(`soundState.${sound.state}`)}</button></>;
}
