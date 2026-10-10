import { Schema } from 'mongoose';
import { cachedModel } from './shared';
import { emailSchema } from '@/lib/validators/staff';

const schema = new Schema({
  restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: function () { return this.role !== 'SUPER_ADMIN'; } },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, validate: (value: string) => emailSchema.safeParse(value).success },
  passwordHash: { type: String, required: true, select: false, match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  role: { type: String, enum: ['OWNER', 'STAFF', 'SUPER_ADMIN'], default: 'STAFF' },
  isActive: { type: Boolean, default: true },
  // Incrementing invalidates all previously issued staff JWTs, including copied cookies.
  authVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger, select: false },
}, { timestamps: true });
schema.pre('validate', function () {
  if (this.role === 'SUPER_ADMIN' && this.restaurantId) this.invalidate('restaurantId', 'Platform accounts cannot belong to a restaurant.');
});
schema.index({ email: 1 }, { unique: true });
schema.index({ restaurantId: 1 });
export const User = cachedModel('User', schema);
