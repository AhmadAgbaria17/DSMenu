import { z } from 'zod';
import { objectIdSchema } from './validators/common';
import type { LiveOrder } from '@/types/live-orders';

export const preparationInput = z.object({
  orderIds: z.array(objectIdSchema).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
  expectedStatus: z.enum(['NEW', 'PREPARING']),
  status: z.enum(['PREPARING', 'READY']),
}).strict().refine(value => value.expectedStatus === 'NEW' ? value.status === 'PREPARING' : value.status === 'READY');

export type PreparationGroup = { key: string; orders: LiveOrder[]; batchAction: boolean };

// Called on one authenticated restaurant snapshot. Include its identity explicitly
// so groups can never survive a tenant switch under the same React key.
export function preparationGroups(orders: LiveOrder[], restaurantId: string): PreparationGroup[] {
  const groups = new Map<string, PreparationGroup>();
  for (const order of orders) {
    const table = order.fulfillmentType !== 'TAKEAWAY' && order.tableSessionId && order.tableId;
    const eligible = !!table && (order.status === 'NEW' || (order.status === 'PREPARING' && !!order.preparationBatchId));
    const key = eligible
      ? `${restaurantId}:${order.tableSessionId}:${order.tableId}:${order.status === 'NEW' ? 'NEW' : order.preparationBatchId}`
      : `${restaurantId}:order:${order.id}`;
    const group = groups.get(key) ?? { key, orders: [], batchAction: eligible };
    group.orders.push(order);
    groups.set(key, group);
  }
  return [...groups.values()];
}
