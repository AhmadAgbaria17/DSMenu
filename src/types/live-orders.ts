import type { CustomerOrder } from './orders';
import type { KitchenPrintMetadata } from '@/lib/kitchen-print';
export type RealtimeConfig = { key: string; cluster: string; channel: string };
export type LiveOrder = CustomerOrder & { kitchenPrint?: KitchenPrintMetadata; tableId?: string; preparationBatchId?: string; tableNumber: number | null; tableSessionId: string | null; takeawaySessionId?: string; customerName?: string; customerPhone?: string; updatedAt: string; notes: string };
export type LiveOrdersSnapshot = { orders: LiveOrder[]; realtime: RealtimeConfig | null; fetchedAt: string };
export type ConnectionState = 'connecting' | 'connected' | 'offline' | 'disabled';
