'use client';
import { useEffect, useEffectEvent, useState } from 'react';
import { subscribeOrders } from '@/lib/realtime-client';
import type { ConnectionState, RealtimeConfig } from '@/types/live-orders';

export function useOrderRealtime(config: RealtimeConfig | null, endpoint: string | null, onRefresh: (silent: boolean) => void) {
  const [state, setState] = useState<ConnectionState>('disabled');
  const refresh = useEffectEvent(onRefresh);
  const { key, cluster, channel } = config ?? {};
  useEffect(() => {
    let disposed = false;
    const update = (value: ConnectionState) => { if (!disposed) setState(value); };
    queueMicrotask(() => update(key && endpoint ? 'connecting' : 'disabled'));
    const stop = key && cluster && channel && endpoint ? subscribeOrders({ key, cluster, channel }, endpoint, silent => refresh(silent), update) : undefined;
    return () => { disposed = true; stop?.(); };
  }, [key, cluster, channel, endpoint]);
  const periodic = useEffectEvent(() => refresh(state !== 'connected'));
  useEffect(() => {
    if (!endpoint) return;
    const focused = () => { if (document.visibilityState === 'visible') periodic(); };
    const interval = setInterval(focused, 30_000);
    window.addEventListener('focus', focused);
    window.addEventListener('online', focused);
    document.addEventListener('visibilitychange', focused);
    return () => { clearInterval(interval); window.removeEventListener('focus', focused); window.removeEventListener('online', focused); document.removeEventListener('visibilitychange', focused); };
  }, [endpoint]);
  return state;
}
