import { Schema, model } from 'mongoose';

const evidenceSchema = new Schema(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    file_url: { type: String, required: true },
    file_id: { type: String }, // GridFS file ID for direct access
    file_type: { type: String, required: true },
    uploaded_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploaded_at: { type: Date, required: true, default: () => new Date() },
    description: { type: String },
    sha256: { type: String },
  },
  { timestamps: false },
);

export const EvidenceModel = model('Evidence', evidenceSchema);
