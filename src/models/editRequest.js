import { Schema, model } from 'mongoose';

const editRequestSchema = new Schema(
  {
    business_id: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    requested_by: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    field_to_edit: { type: String, required: true }, // e.g., 'fine_amount', 'business_name', etc.
    current_value: { type: Schema.Types.Mixed }, // Current value of the field
    requested_value: { type: Schema.Types.Mixed, required: true }, // Requested new value
    reason: { type: String }, // Reason for the edit request
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    reviewed_notes: { type: String }, // Admin notes when approving/rejecting
    expires_at: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days from creation
  },
  { timestamps: true },
);

// Index for efficient queries
editRequestSchema.index({ business_id: 1, status: 1 });
editRequestSchema.index({ requested_by: 1, status: 1 });
editRequestSchema.index({ expires_at: 1 });

// Auto-expire requests that are past expiration date
editRequestSchema.pre('save', function (next) {
  if (this.status === 'pending' && this.expires_at && new Date() > this.expires_at) {
    this.status = 'expired';
  }
  next();
});

export const EditRequestModel = model('EditRequest', editRequestSchema);

