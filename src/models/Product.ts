import { Schema } from 'mongoose';
import { cachedModel, reference, localizedNames, imageSchema, minorUnits } from './shared';

const schema = new Schema({
  restaurantId: reference('Restaurant'), categoryId: reference('Category'), ...localizedNames,
  descriptionAr: { type: String, default: '', maxlength: 2000 },
  descriptionHe: { type: String, default: '', maxlength: 2000 },
  descriptionEn: { type: String, default: '', maxlength: 2000 },
  price: minorUnits,
  image: imageSchema,
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0, validate: Number.isInteger },
}, { timestamps: true });
schema.index({ restaurantId: 1, categoryId: 1, isArchived: 1, sortOrder: 1 });
export const Product = cachedModel('Product', schema);
