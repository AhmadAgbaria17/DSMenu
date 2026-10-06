import type { InferSchemaType, Types } from 'mongoose';
import type { Order } from '@/models';
import type { CustomerOrder, OrderStatus } from '@/types/orders';
export type StoredOrder = InferSchemaType<typeof Order.schema> & { _id: Types.ObjectId };
export function orderDto(order: StoredOrder): CustomerOrder {
  return {
    id: String(order._id), orderNumber: order.orderNumber, status: order.status as OrderStatus,
    subtotal: order.subtotal, currency: order.currency, createdAt: order.createdAt.toISOString(),
    items: order.items.map(item => ({ productId: String(item.productId), nameAr: item.nameAr, nameHe: item.nameHe, nameEn: item.nameEn, price: item.price, quantity: item.quantity, note: item.notes, itemTotal: item.itemTotal })),
  };
}
