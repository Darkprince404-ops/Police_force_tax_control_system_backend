import { AuditLogModel, CaseModel, BusinessModel } from '../models/index.js';

/**
 * Get user activity summary for a specific date
 */
export const getUserActivitySummary = async (
  userId,
  date = new Date(),
) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get user info from audit logs
  const userAudit = await AuditLogModel.findOne({ user: userId, createdAt: { $gte: startOfDay, $lte: endOfDay } })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(1);

  if (!userAudit?.user) {
    return null;
  }

  const user = userAudit.user;

  // Count cases
  const casesCount = await CaseModel.countDocuments({
    assigned_officer_id: userId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  // Count businesses created by this user (if tracked)
  const businessesCount = await AuditLogModel.countDocuments({
    user: userId,
    entity: 'business',
    action: 'create',
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  // Get last activity
  const lastAudit = await AuditLogModel.findOne({ user: userId, createdAt: { $gte: startOfDay, $lte: endOfDay } })
    .sort({ createdAt: -1 });

  return {
    userId: user._id ? user._id.toString() : userId,
    userName: user.name,
    userEmail: user.email,
    casesCount,
    businessesCount,
    lastActivity: lastAudit?.createdAt,
  };
};

/**
 * Get all users' activity for today
 */
export const getAllUsersActivityToday = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all unique user IDs from audit logs today
  const userAudits = await AuditLogModel.distinct('user', {
    createdAt: { $gte: today, $lte: endOfDay },
  });

  const summaries = [];

  for (const userId of userAudits) {
    const summary = await getUserActivitySummary(userId.toString(), today);
    if (summary) {
      summaries.push(summary);
    }
  }

  // Also check for users who created cases or businesses today
  const caseUsers = await CaseModel.distinct('assigned_officer_id', {
    createdAt: { $gte: today, $lte: endOfDay },
  });

  const allUserIds = new Set([...userAudits.map((id) => id.toString()), ...caseUsers.map((id) => id.toString())]);

  for (const userId of allUserIds) {
    if (!summaries.find((s) => s.userId === userId)) {
      const summary = await getUserActivitySummary(userId, today);
      if (summary) {
        summaries.push(summary);
      }
    }
  }

  return summaries.sort((a, b) => (b.lastActivity?.getTime() || 0) - (a.lastActivity?.getTime() || 0));
};

/**
 * Get detailed activity for a user
 */
export const getUserActivityDetails = async (
  userId,
  startDate,
  endDate,
) => {
  const activities = [];

  // Get audit logs
  const auditLogs = await AuditLogModel.find({
    user: userId,
    createdAt: { $gte: startDate, $lte: endDate },
  }).sort({ createdAt: -1 });

  for (const log of auditLogs) {
    if (log.entity === 'case') {
      const caseDoc = await CaseModel.findById(log.entityId);
      if (caseDoc) {
        activities.push({
          type: 'case',
          id: log.entityId.toString(),
          action: log.action,
          timestamp: log.createdAt || new Date(),
          details: { case_number: caseDoc.case_number, status: caseDoc.status },
        });
      }
    } else if (log.entity === 'business') {
      const business = await BusinessModel.findById(log.entityId);
      if (business) {
        activities.push({
          type: 'business',
          id: log.entityId.toString(),
          action: log.action,
          timestamp: log.createdAt || new Date(),
          details: { business_name: business.business_name },
        });
      }
    }
  }

  return activities;
};

