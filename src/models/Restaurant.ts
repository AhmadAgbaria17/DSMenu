import { Schema } from 'mongoose';
import { languages } from '@/types/domain';
import { cachedModel, imageSchema } from './shared';

const schema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  logo: imageSchema,
  coverImage: imageSchema,
  description: { type: String, default: '', maxlength: 2000 },
  phone: String, whatsapp: String, address: String,
  googleMapsUrl: String, instagramUrl: String,
  primaryColor: { type: String, default: '#254b3e', match: /^#[a-f\d]{6}$/i },
  secondaryColor: { type: String, default: '#f6f3ea', match: /^#[a-f\d]{6}$/i },
  currency: { type: String, enum: ['ILS'], default: 'ILS' },
  defaultLanguage: { type: String, enum: languages, default: 'ar' },
  enabledLanguages: { type: [String], enum: languages, default: ['ar', 'he', 'en'], validate: (v: string[]) => v.length > 0 && new Set(v).size === v.length },
  hideUnavailableProducts: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ slug: 1 }, { unique: true });
schema.pre('validate', function () {
  if (!this.enabledLanguages.includes(this.defaultLanguage)) this.invalidate('defaultLanguage', 'Default language must be enabled.');
});
export const Restaurant = cachedModel('Restaurant', schema);
