import { Schema, models, deleteModel } from 'mongoose';
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
  closeReason: { type: String, enum: ['MANUAL', 'AUTO_EMPTY_TIMEOUT'] },
  // Low-entropy shared entry gate, not the device authentication credential.
  // Only explicit server verification/staff projections may read it.
  accessCode: { type: String, match: /^[0-9]{3}$/, select: false },
  codeAttemptCount: { type: Number, default: 0, min: 0, validate: Number.isInteger, select: false },
  codeAttemptWindowAt: { type: Date, select: false },
  // Separate hashed credentials let multiple browsers join one table visit safely.
  credentials: { type: [credentialSchema], default: [], select: false },
  lastActivityAt: Date,
  serviceCallSequence: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  nextOrderNumber: { type: Number, default: 0, min: 0, validate: Number.isInteger },
}, { timestamps: true });
schema.index({ restaurantId: 1, tableId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
schema.index({ restaurantId: 1, status: 1 });
schema.index({ restaurantId: 1, createdAt: -1 });
schema.index({ status: 1, nextOrderNumber: 1, createdAt: 1 }, { name: 'empty_session_cleanup' });
schema.index({ restaurantId: 1, status: 1, createdAt: 1 }, { name: 'tenant_session_cleanup' });
if (models.TableSession && !models.TableSession.schema.path('accessCode')) deleteModel('TableSession');
export const TableSession = cachedModel('TableSession', schema);
