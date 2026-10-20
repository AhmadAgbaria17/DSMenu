import type { CustomerOrder } from './orders';
export type RealtimeConfig = { key: string; cluster: string; channel: string };
export type LiveOrder = CustomerOrder & { tableId?: string; preparationBatchId?: string; tableNumber: number | null; tableSessionId: string | null; takeawaySessionId?: string; customerName?: string; customerPhone?: string; updatedAt: string; notes: string };
export type LiveOrdersSnapshot = { orders: LiveOrder[]; realtime: RealtimeConfig | null; fetchedAt: string };
export type ConnectionState = 'connecting' | 'connected' | 'offline' | 'disabled';
