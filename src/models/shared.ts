import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

export const reference = (ref: string) => ({ type: Schema.Types.ObjectId, ref, required: true } as const);
export const localizedNames = {
  nameAr: { type: String, required: true, trim: true, maxlength: 160 },
  nameHe: { type: String, required: true, trim: true, maxlength: 160 },
  nameEn: { type: String, required: true, trim: true, maxlength: 160 },
} as const;
export const imageSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
}, { _id: false });
export const minorUnits = { type: Number, required: true, min: 0, max: 100_000_000, validate: Number.isSafeInteger } as const;

export function cachedModel<S extends Schema>(name: string, schema: S): Model<InferSchemaType<S>> {
  return (models[name] as Model<InferSchemaType<S>> | undefined) ?? model<InferSchemaType<S>>(name, schema);
}
