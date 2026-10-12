import 'server-only';
import Pusher from 'pusher';
import { realtimeEnv } from './env';
import { restaurantChannel, visitChannel, takeawayChannel, type RealtimeEvent } from './realtime-channels';
import type { RealtimeConfig } from '@/types/live-orders';

function provider() {
  const env = realtimeEnv();
  return env ? new Pusher({ ...env, useTLS: true, timeout: 3000 }) : null;
}
export function realtimeConfig(channel: string): RealtimeConfig | null {
  try { const env = realtimeEnv(); return env ? { key: env.key, cluster: env.cluster, channel } : null; }
  catch { console.error('Realtime configuration invalid'); return null; }
}
export function authorizeRealtime(socketId: string, channel: string) {
  const pusher = provider();
  if (!pusher) return null;
  return pusher.authorizeChannel(socketId, channel);
}
export async function publishOrderChange(restaurantId: string, tableSessionId: string, event: RealtimeEvent, fulfillmentType: 'TABLE' | 'TAKEAWAY' = 'TABLE') {
  try {
    const pusher = provider();
    if (!pusher) return;
    // Invalidation only: no identities, tokens, prices, notes or customer data.
    await pusher.trigger([restaurantChannel(restaurantId), fulfillmentType === 'TAKEAWAY' ? takeawayChannel(tableSessionId) : visitChannel(tableSessionId)], event, { version: 1 });
  } catch {
    // A committed business operation remains successful if notification delivery fails.
    console.error('Realtime notification failed', { event });
  }
}
export const publishServiceChange = publishOrderChange;
