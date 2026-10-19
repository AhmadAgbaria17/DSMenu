import { Schema } from 'mongoose';
import { cachedModel, reference } from './shared';
import { optionGroup } from './product-options';
import { optionGroupsSchema } from '@/lib/product-options';
const schema = new Schema({
  restaurantId: reference('Restaurant'),
  templateName: { type: String, required: true, trim: true, maxlength: 120 },
  isActive: { type: Boolean, default: true },
  group: { type: optionGroup, required: true, validate: (value: unknown) => optionGroupsSchema.safeParse([JSON.parse(JSON.stringify(value))]).success },
}, { timestamps: true });
schema.index({ restaurantId: 1, templateName: 1 });
export const ProductOptionTemplate = cachedModel('ProductOptionTemplate', schema);
