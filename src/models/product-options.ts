import { Schema } from 'mongoose';
import { localizedNames, minorUnits } from './shared';
const option = new Schema({ id: { type: String, required: true }, ...localizedNames, priceDelta: minorUnits, isDefault: { type: Boolean, default: false }, isActive: { type: Boolean, default: true }, sortOrder: { type: Number, default: 0 } }, { _id: false });
export const optionGroup = new Schema({ sourceTemplateId: { type: String, match: /^[a-f0-9]{24}$/i }, id: { type: String, required: true }, ...localizedNames, type: { type: String, enum: ['SINGLE', 'MULTIPLE', 'INCLUDED'], required: true }, required: { type: Boolean, default: false }, minSelections: { type: Number, default: 0 }, maxSelections: { type: Number, required: true }, sortOrder: { type: Number, default: 0 }, isActive: { type: Boolean, default: true }, options: [option] }, { _id: false });
const snapshotOption = new Schema({ id: { type: String, required: true }, ...localizedNames, priceDelta: minorUnits }, { _id: false });
export const optionSnapshot = new Schema({ id: { type: String, required: true }, ...localizedNames, selected: [snapshotOption], removed: [snapshotOption] }, { _id: false });
