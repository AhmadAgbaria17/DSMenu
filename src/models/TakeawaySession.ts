import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';
const schema = new Schema({
  restaurantId: reference('Restaurant'),
  tokenHash: { type: String, required: true, select: false, match: /^[a-f\d]{64}$/ },
  customerName: { type: String, required: true, minlength: 2, maxlength: 100 },
  customerPhone: { type: String, required: true, match: /^\+?[0-9]{7,15}$/ },
  status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
  expiresAt: { type: Date, required: true },
  closedAt: Date,
  nextOrderNumber: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  lastActivityAt: Date,
}, { timestamps: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ restaurantId: 1, status: 1, expiresAt: 1 });
// No TTL: retain the visit for operational history; expiry controls authorization only.
export const TakeawaySession = cachedModel('TakeawaySession', schema);
