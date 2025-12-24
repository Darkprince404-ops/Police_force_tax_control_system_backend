import { AuditLogModel } from '../models/index.js';

const maskSensitive = (details) => {
  if (!details) return details;
  const clone = { ...details };
  if (clone['contact_email']) clone['contact_email'] = '***';
  if (clone['contact_phone']) clone['contact_phone'] = '***';
  return clone;
};

export const recordAudit = async (params) => {
  await AuditLogModel.create({
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    user: params.userId,
    details: maskSensitive(params.details),
  });
};

