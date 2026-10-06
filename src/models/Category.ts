import { Schema } from 'mongoose';
import { cachedModel, reference, localizedNames, imageSchema } from './shared';

const schema = new Schema({
  restaurantId: reference('Restaurant'), ...localizedNames,
  image: imageSchema,
  sortOrder: { type: Number, default: 0, validate: Number.isInteger },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ restaurantId: 1, isActive: 1, sortOrder: 1 });
export const Category = cachedModel('Category', schema);
