import { Schema, model } from 'mongoose';

const notificationSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    case_id: { type: Schema.Types.ObjectId, ref: 'Case', index: true },
    edit_request_id: { type: Schema.Types.ObjectId, ref: 'EditRequest', index: true },
    type: { type: String, enum: ['comeback_reminder', 'case_update', 'edit_request_approved', 'edit_request_rejected', 'edit_request_created'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    read_at: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ user_id: 1, read: 1, createdAt: -1 });

export const NotificationModel = model('Notification', notificationSchema);

