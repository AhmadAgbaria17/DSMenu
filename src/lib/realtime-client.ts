'use client';
import Pusher from 'pusher-js';
import { z } from 'zod';
import { realtimeEvents } from './realtime-channels';
import type { ConnectionState, RealtimeConfig } from '@/types/live-orders';

export function subscribeOrders(config: RealtimeConfig, endpoint: string, onChange: (silent: boolean) => void, onState: (state: ConnectionState) => void) {
  let disposed = false;
  const pusher = new Pusher(config.key, {
    cluster: config.cluster, forceTLS: true, enabledTransports: ['ws'], disableStats: true,
    channelAuthorization: { customHandler: (params, callback) => {
      void fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ socket_id: params.socketId, channel_name: params.channelName }), signal: AbortSignal.timeout(10_000) })
        .then(async response => {
          if (!response.ok) throw new Error('Subscription denied');
          const result = z.object({ auth: z.string() }).parse(await response.json());
          if (!disposed) callback(null, result);
        }).catch(() => { if (!disposed) { callback(new Error('Subscription unavailable'), null); onState('offline'); } });
    } },
  });
  const channel = pusher.subscribe(config.channel);
  channel.bind('pusher:subscription_succeeded', () => { onState('connected'); onChange(true); });
  channel.bind('pusher:subscription_error', () => onState('offline'));
  for (const event of realtimeEvents) channel.bind(event, () => onChange(false));
  pusher.connection.bind('state_change', ({ current }: { current: string }) => {
    if (current !== 'connected') onState(current === 'connecting' ? 'connecting' : 'offline');
  });
  // Periodically renew authorization; payloads contain no business data even before
  // a revoked connection is replaced. Every triggered read is independently authorized.
  const lease = setInterval(() => { pusher.disconnect(); pusher.connect(); }, 5 * 60_000);
  return () => { disposed = true; clearInterval(lease); channel.unbind_all(); pusher.disconnect(); };
}
