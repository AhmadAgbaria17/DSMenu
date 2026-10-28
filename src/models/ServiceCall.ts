import { Schema } from 'mongoose';
import { serviceTypes, serviceStatuses } from '@/types/domain';
import { cachedModel, reference } from './shared';

const schema = new Schema({
  restaurantId: reference('Restaurant'), tableId: reference('Table'), tableSessionId: reference('TableSession'),
  type: { type: String, required: true, enum: serviceTypes },
  status: { type: String, enum: serviceStatuses, default: 'PENDING' },
  acknowledgedAt: Date, resolvedAt: Date,
}, { timestamps: true });
schema.index({ restaurantId: 1, status: 1, createdAt: -1 });
schema.index({ restaurantId: 1, createdAt: -1 });
schema.index({ restaurantId: 1, tableSessionId: 1, status: 1 }, { name: 'session_unresolved_calls' });
schema.index({ restaurantId: 1, tableSessionId: 1, type: 1, createdAt: -1 });
schema.index({ tableSessionId: 1, type: 1 }, {
  unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'ACKNOWLEDGED'] } },
});
export const ServiceCall = cachedModel('ServiceCall', schema);
