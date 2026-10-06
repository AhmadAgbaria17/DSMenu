import { z } from 'zod';
import { orderStatuses } from '@/types/domain';
import type { OrderStatus } from '@/types/orders';

export const activeOrderStatuses = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] as const;
export const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'], READY: ['SERVED'], SERVED: [], CANCELLED: [],
};
export const statusChangeSchema = z.object({ expectedStatus: z.enum(orderStatuses), status: z.enum(orderStatuses) });
export function canTransition(from: OrderStatus, to: OrderStatus) { return transitions[from].includes(to); }

// A snapshot after initial load/reconnect is a silent baseline, never a new alert.
export function unseenNewOrders(seen: Set<string>, orders: { id: string; status: OrderStatus }[], silent: boolean) {
  const fresh = orders.filter(order => order.status === 'NEW' && !seen.has(order.id));
  for (const order of orders) seen.add(order.id);
  return silent ? [] : fresh.map(order => order.id);
}
