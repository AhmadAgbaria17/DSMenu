import { Schema } from 'mongoose';
import { orderStatuses } from '@/types/domain';
import { cachedModel, reference, localizedNames, minorUnits } from './shared';
import { optionSnapshot } from './product-options';

const itemSchema = new Schema({
  productId: reference('Product'), ...localizedNames,
  price: minorUnits,
  basePrice: { ...minorUnits, required: false },
  optionsTotal: { ...minorUnits, required: false },
  optionGroups: { type: [optionSnapshot], default: [] },
  quantity: { type: Number, required: true, min: 1, max: 99, validate: Number.isInteger },
  notes: { type: String, maxlength: 500, default: '' },
  itemTotal: minorUnits,
}, { _id: false });
const schema = new Schema({
  restaurantId: reference('Restaurant'),
  fulfillmentType: { type: String, enum: ['TABLE', 'TAKEAWAY'], default: 'TABLE' },
  tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: function (this: { fulfillmentType?: string }): boolean { return this.fulfillmentType !== 'TAKEAWAY'; } },
  tableSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', required: function (this: { fulfillmentType?: string }): boolean { return this.fulfillmentType !== 'TAKEAWAY'; } },
  takeawaySessionId: { type: Schema.Types.ObjectId, ref: 'TakeawaySession', required: function (this: { fulfillmentType?: string }): boolean { return this.fulfillmentType === 'TAKEAWAY'; } },
  customerName: { type: String, maxlength: 100, required: function (this: { fulfillmentType?: string }): boolean { return this.fulfillmentType === 'TAKEAWAY'; } },
  customerPhone: { type: String, match: /^\+?[0-9]{7,15}$/, required: function (this: { fulfillmentType?: string }): boolean { return this.fulfillmentType === 'TAKEAWAY'; } },
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
schema.index({ tableSessionId: 1, orderNumber: 1 }, { name: 'table_order_number', unique: true, partialFilterExpression: { tableSessionId: { $type: 'objectId' } } });
schema.index({ restaurantId: 1, tableSessionId: 1, idempotencyKey: 1 }, { name: 'table_idempotency', unique: true, partialFilterExpression: { tableSessionId: { $type: 'objectId' } } });
schema.index({ takeawaySessionId: 1, orderNumber: 1 }, { name: 'takeaway_order_number', unique: true, partialFilterExpression: { takeawaySessionId: { $type: 'objectId' } } });
schema.index({ restaurantId: 1, takeawaySessionId: 1, idempotencyKey: 1 }, { name: 'takeaway_idempotency', unique: true, partialFilterExpression: { takeawaySessionId: { $type: 'objectId' } } });
schema.pre('validate', function () {
  if (this.fulfillmentType === 'TAKEAWAY' && (this.tableId || this.tableSessionId)) this.invalidate('tableId', 'Takeaway cannot reference a table.');
  if (this.fulfillmentType !== 'TAKEAWAY' && (this.takeawaySessionId || this.customerName || this.customerPhone)) this.invalidate('takeawaySessionId', 'Table orders cannot reference takeaway identity.');
});
export const Order = cachedModel('Order', schema);
