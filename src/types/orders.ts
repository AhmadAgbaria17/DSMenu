import type { LocalizedName, orderStatuses } from './domain';

export type OrderStatus = (typeof orderStatuses)[number];
export type CustomerOrder = {
  fulfillmentType?: 'TABLE' | 'TAKEAWAY';
  id: string;
  orderNumber: number;
  status: OrderStatus;
  subtotal: number;
  currency: string;
  createdAt: string;
  items: (LocalizedName & { optionGroups?: import('@/lib/product-options').OptionSnapshot[]; basePrice?: number; optionsTotal?: number; productId: string; price: number; quantity: number; note: string; itemTotal: number })[];
};
export const customerErrorCodes = ['INVALID_REQUEST', 'FORBIDDEN', 'TABLE_UNAVAILABLE', 'SESSION_REQUIRED', 'SESSION_CLOSED', 'SESSION_LIMIT', 'ITEMS_UNAVAILABLE', 'NOTES_DISABLED', 'REQUEST_CONFLICT', 'ORDER_LIMIT', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'VISIT_CHANGED'] as const;
export type CustomerErrorCode = (typeof customerErrorCodes)[number];
export type CustomerError = { code: CustomerErrorCode; itemIds?: string[] };
export type OrdersResponse = { visitId: string; orders: CustomerOrder[]; realtime?: import('./live-orders').RealtimeConfig | null };
