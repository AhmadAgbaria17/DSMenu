import { Schema } from 'mongoose';
import { orderStatuses } from '@/types/domain';
import { cachedModel, reference, localizedNames, minorUnits } from './shared';

const itemSchema = new Schema({
  productId: reference('Product'), ...localizedNames,
  price: minorUnits,
  quantity: { type: Number, required: true, min: 1, max: 99, validate: Number.isInteger },
  notes: { type: String, maxlength: 500, default: '' },
  itemTotal: minorUnits,
}, { _id: false });
const schema = new Schema({
  restaurantId: reference('Restaurant'), tableId: reference('Table'), tableSessionId: reference('TableSession'),
  orderNumber: { type: Number, required: true, min: 1, validate: Number.isInteger },
  idempotencyKey: { type: String, required: true, maxlength: 100 },
  requestFingerprint: { type: String, match: /^[a-f\d]{64}$/, select: false },
  status: { type: String, enum: orderStatuses, default: 'NEW' },
  acceptedAt: Date, preparingAt: Date, readyAt: Date, servedAt: Date, cancelledAt: Date,
  items: { type: [itemSchema], required: true, validate: (v: unknown[]) => v.length > 0 && v.length <= 100 },
  subtotal: minorUnits,
  currency: { type: String, enum: ['ILS'], default: 'ILS' },
  notes: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });
schema.index({ restaurantId: 1, status: 1, createdAt: -1 });
schema.index({ restaurantId: 1, createdAt: -1 });
schema.index({ tableSessionId: 1, orderNumber: 1 }, { unique: true });
schema.index({ restaurantId: 1, tableSessionId: 1, idempotencyKey: 1 }, { unique: true });
export const Order = cachedModel('Order', schema);
