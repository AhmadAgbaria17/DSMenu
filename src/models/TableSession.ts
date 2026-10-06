import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';

const credentialSchema = new Schema({
  tokenHash: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  expiresAt: { type: Date, required: true },
}, { _id: false });
const schema = new Schema({
  restaurantId: reference('Restaurant'),
  tableId: reference('Table'),
  status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
  closedAt: Date,
  // Separate hashed credentials let multiple browsers join one table visit safely.
  credentials: { type: [credentialSchema], default: [], select: false },
  lastActivityAt: Date,
  serviceCallSequence: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  nextOrderNumber: { type: Number, default: 0, min: 0, validate: Number.isInteger },
}, { timestamps: true });
schema.index({ restaurantId: 1, tableId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
schema.index({ restaurantId: 1, status: 1 });
schema.index({ restaurantId: 1, createdAt: -1 });
export const TableSession = cachedModel('TableSession', schema);
