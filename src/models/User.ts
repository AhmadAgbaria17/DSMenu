import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';
import { emailSchema } from '@/lib/validators/staff';

const schema = new Schema({
  restaurantId: reference('Restaurant'),
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, validate: (value: string) => emailSchema.safeParse(value).success },
  passwordHash: { type: String, required: true, select: false, match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  role: { type: String, enum: ['OWNER', 'STAFF'], default: 'STAFF' },
  isActive: { type: Boolean, default: true },
  // Incrementing invalidates all previously issued staff JWTs, including copied cookies.
  authVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger, select: false },
}, { timestamps: true });
schema.index({ email: 1 }, { unique: true });
schema.index({ restaurantId: 1 });
export const User = cachedModel('User', schema);
