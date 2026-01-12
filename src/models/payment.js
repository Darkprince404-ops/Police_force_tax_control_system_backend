import { Schema, model } from 'mongoose';

const paymentSchema = new Schema(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    payment_date: { type: Date, required: true },
    payment_method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'other'], default: 'cash' },
    receipt_reference: { type: String, required: true, trim: true },
    receipt_file_id: { type: String }, // GridFS file ID for receipt image
    verified_by: { type: Schema.Types.ObjectId, ref: 'User' },
    verified_at: { type: Date },
    notes: { type: String },
    status: { 
      type: String, 
      enum: ['pending_verification', 'verified', 'rejected'], 
      default: 'pending_verification',
      index: true
    },
  },
  { timestamps: true },
);

paymentSchema.index({ case_id: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 }); // For finance dashboard

export const PaymentModel = model('Payment', paymentSchema);
