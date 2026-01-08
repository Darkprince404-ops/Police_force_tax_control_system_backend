import { Schema, model } from 'mongoose';

const businessSchema = new Schema(
  {
    business_id: { type: String, unique: true, index: true, sparse: true },
    business_name: { type: String, required: true, trim: true },
    owner_name: { type: String },
    address: { type: String },
    contact_phone: { type: String },
    contact_email: { type: String },
    business_type: { type: String },
    business_type_id: { type: Schema.Types.ObjectId, ref: 'BusinessType', index: true },
    tax_id: { type: String, index: true },
    registration_number: { type: String },
    owner_id_image_url: { type: String },
    owner_id_image_file_id: { type: String }, // GridFS file ID for owner ID image
    state: { type: String }, // Somali state/region
    district: { type: String }, // District (especially for Mogadishu)
  },
  { timestamps: true },
);

businessSchema.index(
  { business_name: 'text', tax_id: 'text', address: 'text', business_id: 'text', owner_name: 'text', business_type: 'text' },
  { name: 'business_text_search' },
);

export const BusinessModel = model('Business', businessSchema);

