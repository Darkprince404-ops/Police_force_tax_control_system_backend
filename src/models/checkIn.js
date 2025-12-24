import { Schema, model } from 'mongoose';

const checkInSchema = new Schema(
  {
    business_id: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    officer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    check_in_date: { type: Date, required: true },
    location_geo: { type: String },
    phone: { type: String },
    fine: { type: Number, default: 0 },
    notes: { type: String },
  },
  { timestamps: true },
);

export const CheckInModel = model('CheckIn', checkInSchema);
