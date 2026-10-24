import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';

// One record per stable preparation unit; batch members never carry competing counts.
const schema = new Schema({
  restaurantId: reference('Restaurant'),
  unitType: { type: String, enum: ['batch', 'order'], required: true },
  unitId: { type: Schema.Types.ObjectId, required: true },
  kitchenPrintCount: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  kitchenPrintedAt: { type: Date, required: true },
  lastKitchenPrintedBy: reference('User'),
  lastRequestId: { type: String, required: true, select: false },
}, { timestamps: true });
schema.index({ restaurantId: 1, unitType: 1, unitId: 1 }, { unique: true, name: 'kitchen_print_unit' });
export const KitchenPrintState = cachedModel('KitchenPrintState', schema);
