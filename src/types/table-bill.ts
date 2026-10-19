import type { CustomerOrder } from './orders';
export type BillOrder = CustomerOrder & { notes: string };
export type TableSessionBill = {
  restaurantName: string; sessionId: string; tableNumber: number; openedAt: string;
  status: 'ACTIVE' | 'CLOSED'; closedAt: string | null;
  orders: BillOrder[]; orderCount: number; cancelledCount: number;
  finalTotal: number; currency: string; activeOrders: number; unresolvedCalls: number;
  canClose: boolean; revision: string;
};
