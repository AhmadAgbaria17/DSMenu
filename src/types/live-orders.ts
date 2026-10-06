import type { CustomerOrder } from './orders';
export type RealtimeConfig = { key: string; cluster: string; channel: string };
export type LiveOrder = CustomerOrder & { tableNumber: number | null; tableSessionId: string; updatedAt: string; notes: string };
export type LiveOrdersSnapshot = { orders: LiveOrder[]; realtime: RealtimeConfig | null; fetchedAt: string };
export type ConnectionState = 'connecting' | 'connected' | 'offline' | 'disabled';
