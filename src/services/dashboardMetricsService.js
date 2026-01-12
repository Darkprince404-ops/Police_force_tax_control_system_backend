/**
 * Unified Dashboard Metrics Service
 * 
 * Centralizes all dashboard metric calculations to ensure consistency
 * across dashboard cards, reports, and needs-attention panels.
 */

import { CaseModel } from '../models/index.js';

/**
 * Get pending backlog count
 * Definition: Cases in Open, UnderAssessment, or PendingComeback status
 */
export const getPendingBacklog = async (filters = {}) => {
  return await CaseModel.countDocuments({
    ...filters,
    status: { $in: ['Open', 'UnderAssessment', 'PendingComeback'] }
  });
};

/**
 * Get resolved cases count
 * Definition: Cases with status Resolved or NotGuilty
 */
export const getResolvedCount = async (filters = {}) => {
  return await CaseModel.countDocuments({
    ...filters,
    status: { $in: ['Resolved', 'NotGuilty'] }
  });
};

/**
 * Get overdue comebacks count
 * Definition: Cases with status PendingComeback and comeback_date < today
 */
export const getOverdueComebacks = async (filters = {}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await CaseModel.countDocuments({
    ...filters,
    status: 'PendingComeback',
    comeback_date: { $lt: today }
  });
};

/**
 * Get overdue comebacks list (for needs-attention)
 */
export const getOverdueComebacksList = async (limit = 10) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await CaseModel.find({
    status: 'PendingComeback',
    comeback_date: { $lt: today }
  })
    .select('case_number status comeback_date assigned_officer_id check_in_id')
    .populate('assigned_officer_id', 'name')
    .populate({
      path: 'check_in_id',
      populate: { path: 'business_id', select: 'business_name' }
    })
    .sort({ comeback_date: 1 })
    .limit(limit)
    .lean();
};

/**
 * Get aging/stale assessments
 * Definition: Cases with status UnderAssessment and lastActivityAt > 48 hours ago
 */
export const getAgingAssessments = async (hoursThreshold = 48, limit = 10) => {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - hoursThreshold);
  
  return await CaseModel.find({
    status: 'UnderAssessment',
    $or: [
      { lastActivityAt: { $lt: threshold } },
      { lastActivityAt: { $exists: false }, updatedAt: { $lt: threshold } } // Fallback for old cases
    ]
  })
    .select('case_number status lastActivityAt updatedAt assigned_officer_id check_in_id')
    .populate('assigned_officer_id', 'name')
    .populate({
      path: 'check_in_id',
      populate: { path: 'business_id', select: 'business_name' }
    })
    .sort({ lastActivityAt: 1, updatedAt: 1 }) // Oldest first
    .limit(limit)
    .lean();
};

/**
 * Get resolution rate
 * @param {Object} filters - MongoDB filter for cases
 * @returns {number} Resolution rate as percentage (0-100)
 */
export const getResolutionRate = async (filters = {}) => {
  const totalCases = await CaseModel.countDocuments(filters);
  if (totalCases === 0) return 0;
  
  const resolvedCases = await CaseModel.countDocuments({
    ...filters,
    status: { $in: ['Resolved', 'NotGuilty'] }
  });
  
  return Math.round((resolvedCases / totalCases) * 100 * 10) / 10; // Round to 1 decimal
};

/**
 * Get total cases count
 */
export const getTotalCases = async (filters = {}) => {
  return await CaseModel.countDocuments(filters);
};

/**
 * Get dashboard metrics (unified)
 * Returns all key metrics in one call for consistency
 */
export const getDashboardMetrics = async (options = {}) => {
  const {
    startDate,
    endDate,
    case_type,
    status,
    business_search
  } = options;

  // Build base filter
  const baseFilter = {};
  
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    baseFilter.createdAt = { $gte: start, $lte: end };
  }
  
  if (case_type) baseFilter.case_type = case_type;
  if (status) baseFilter.status = status;
  
  // Business search filter (if needed, would require join logic)
  // For now, we'll handle this at the route level if needed
  
  const [totalCases, resolvedCount, pendingBacklog, overdueComebacks] = await Promise.all([
    getTotalCases(baseFilter),
    getResolvedCount(baseFilter),
    getPendingBacklog(baseFilter),
    getOverdueComebacks(baseFilter)
  ]);
  
  const resolutionRate = totalCases > 0 
    ? Math.round((resolvedCount / totalCases) * 100 * 10) / 10 
    : 0;
  
  return {
    total_cases: totalCases,
    resolved_count: resolvedCount,
    resolution_rate: resolutionRate,
    pending_backlog: pendingBacklog,
    overdue_comebacks: overdueComebacks
  };
};
