import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';

const schema = new Schema({
  restaurantId: reference('Restaurant'),
  tableNumber: { type: Number, required: true, min: 1, max: 9999, validate: Number.isInteger },
  label: { type: String, trim: true, maxlength: 100 },
  isActive: { type: Boolean, default: true },
  // Shared write lock for visit creation and administrative lifecycle changes.
  lifecycleVersion: { type: Number, default: 0, select: false },
}, { timestamps: true });
// QR URLs are derived from APP_URL + current slug + tableNumber, never stale copies.
schema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });
export const Table = cachedModel('Table', schema);
