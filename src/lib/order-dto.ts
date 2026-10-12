import type { InferSchemaType, Types } from 'mongoose';
import type { Order } from '@/models';
import type { CustomerOrder, OrderStatus } from '@/types/orders';
export type StoredOrder = InferSchemaType<typeof Order.schema> & { _id: Types.ObjectId };
export function orderDto(order: StoredOrder): CustomerOrder {
  return {
    fulfillmentType: order.fulfillmentType === 'TAKEAWAY' ? 'TAKEAWAY' : 'TABLE', id: String(order._id), orderNumber: order.orderNumber, status: order.status as OrderStatus,
    subtotal: order.subtotal, currency: order.currency, createdAt: order.createdAt.toISOString(),
    items: order.items.map(item => ({ basePrice: item.basePrice ?? item.price, optionsTotal: item.optionsTotal ?? 0, optionGroups: (item.optionGroups ?? []).map(g => ({ id: g.id, nameAr: g.nameAr, nameHe: g.nameHe, nameEn: g.nameEn, selected: g.selected.map(o => ({ id: o.id, nameAr: o.nameAr, nameHe: o.nameHe, nameEn: o.nameEn, priceDelta: o.priceDelta })), removed: g.removed.map(o => ({ id: o.id, nameAr: o.nameAr, nameHe: o.nameHe, nameEn: o.nameEn, priceDelta: o.priceDelta })) })), productId: String(item.productId), nameAr: item.nameAr, nameHe: item.nameHe, nameEn: item.nameEn, price: item.price, quantity: item.quantity, note: item.notes, itemTotal: item.itemTotal })),
  };
}
