import { Schema, models, deleteModel } from 'mongoose';
import { cachedModel, reference, localizedNames, imageSchema, minorUnits } from './shared';
import { optionGroup } from './product-options';
import { optionGroupsSchema } from '@/lib/product-options';

const schema = new Schema({
  restaurantId: reference('Restaurant'), categoryId: reference('Category'), ...localizedNames,
  descriptionAr: { type: String, default: '', maxlength: 2000 },
  descriptionHe: { type: String, default: '', maxlength: 2000 },
  descriptionEn: { type: String, default: '', maxlength: 2000 },
  price: minorUnits,
  discountPrice: {
    ...minorUnits, required: false,
    validate: {
      validator: function (this: { get(path: string): unknown }, value: number | null | undefined) {
        const price = this.get('price');
        return value == null || (Number.isSafeInteger(value) && value >= 0 && typeof price === 'number' && value < price);
      },
      message: 'Discount must be lower than regular price.',
    },
  },
  optionGroups: { type: [optionGroup], default: [], validate: (value: unknown) => optionGroupsSchema.safeParse(JSON.parse(JSON.stringify(value))).success },
  image: imageSchema,
  allowCustomerNote: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0, validate: Number.isInteger },
}, { timestamps: true });
schema.index({ restaurantId: 1, categoryId: 1, isArchived: 1, sortOrder: 1 });
schema.pre('validate', function () { if (this.discountPrice != null && this.discountPrice >= this.price) this.invalidate('discountPrice', 'Discount must be lower than regular price.'); });
if (models.Product && !models.Product.schema.path('discountPrice')) deleteModel('Product');
export const Product = cachedModel('Product', schema);
