import { Schema, model } from 'mongoose';

const duplicateReviewSchema = new Schema(
  {
    existing_business_id: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    new_business_data: {
      business_name: { type: String, required: true },
      owner_name: { type: String },
      address: { type: String },
      contact_phone: { type: String },
      contact_email: { type: String },
      business_type: { type: String },
      tax_id: { type: String },
      district: { type: String },
      department: { type: String },
      fined_amount: { type: Number },
      case_field: { type: String },
      case_date: { type: Date },
    },
    match_type: { type: String, enum: ['tax_id', 'both', 'business_name_only'], required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'merged'],
      default: 'pending',
    },
    decision: {
      type: String,
      enum: ['keep', 'delete', 'merge'],
    },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    notes: { type: String },
    import_job_id: { type: Schema.Types.ObjectId, ref: 'ImportJob' },
  },
  { timestamps: true },
);

duplicateReviewSchema.index({ status: 1, import_job_id: 1 });
duplicateReviewSchema.index({ existing_business_id: 1 });

export const DuplicateReviewModel = model('DuplicateReview', duplicateReviewSchema);

