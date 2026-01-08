import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    details: { type: Object },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ entity: 1, action: 1, createdAt: -1 });

export const AuditLogModel = model('AuditLog', auditLogSchema);

