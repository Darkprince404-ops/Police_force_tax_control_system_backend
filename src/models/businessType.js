import { Schema, model } from 'mongoose';

const businessTypeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    display_name: { type: String, required: true },
    usage_count: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

businessTypeSchema.index({ name: 'text', display_name: 'text' });

export const BusinessTypeModel = model('BusinessType', businessTypeSchema);

