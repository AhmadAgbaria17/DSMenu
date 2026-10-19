import type { BillOrder } from '@/types/table-bill';
import { activeOrderStatuses } from './order-flow';
// Stored subtotals already include option charges and quantities. Never reprice products.
export function summarizeBill(orders: BillOrder[]) {
  const included = orders.filter(order => order.status !== 'CANCELLED');
  const currency = orders[0]?.currency ?? 'ILS';
  if (orders.some(order => order.currency !== currency || !Number.isSafeInteger(order.subtotal) || order.subtotal < 0)) throw new Error('Invalid stored bill amounts');
  const finalTotal = included.reduce((total, order) => total + order.subtotal, 0);
  if (!Number.isSafeInteger(finalTotal)) throw new Error('Invalid stored bill total');
  return { finalTotal, currency, orderCount: included.length, cancelledCount: orders.length - included.length, activeOrders: orders.filter(order => activeOrderStatuses.some(status => status === order.status)).length };
}
