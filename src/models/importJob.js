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
    originalFilename: { type: String }, // Original filename uploaded by user
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mapping: { type: Object },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    // Storage fields
    storageType: { type: String, enum: ['local', 'cloudinary', 'gridfs'], default: 'gridfs' },
    cloudinaryUrl: { type: String }, // Cloudinary URL if uploaded to cloud (legacy)
    cloudinaryPublicId: { type: String }, // Cloudinary public ID for deletion (legacy)
    fileUrl: { type: String }, // URL to access the file
    // Progress tracking
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
    currentBatch: { type: Number, default: 0 },
    totalBatches: { type: Number, default: 0 },
    errorMessage: { type: String },
    summary: { type: Object },
    rows: [importRowSchema],
  },
  { timestamps: true },
);

export const ImportJobModel = model('ImportJob', importJobSchema);
