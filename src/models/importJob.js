import { Schema, model } from 'mongoose';

import { ImportRowStatus } from '../constants/enums.js';

const importRowSchema = new Schema(
  {
    rowIndex: { type: Number, required: true },
    status: { type: String, enum: ImportRowStatus, required: true },
    message: { type: String },
    createdBusinessId: { type: String },
    updatedBusinessId: { type: String },
    createdCheckInId: { type: String },
    createdCaseId: { type: String },
  },
  { _id: false },
);

const importJobSchema = new Schema(
  {
    filename: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mapping: { type: Object },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    summary: { type: Object },
    rows: [importRowSchema],
  },
  { timestamps: true },
);

export const ImportJobModel = model('ImportJob', importJobSchema);
