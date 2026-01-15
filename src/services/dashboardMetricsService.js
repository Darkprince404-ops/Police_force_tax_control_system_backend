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
 * Hardened against null/undefined fields
 */
export const getOverdueComebacks = async (filters = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return await CaseModel.countDocuments({
      ...filters,
      status: 'PendingComeback',
      comeback_date: { $exists: true, $ne: null, $lt: today }
    });
  } catch (error) {
    console.error('[getOverdueComebacks] Error:', error);
    return 0; // Return 0 on error
  }
};

/**
 * Get overdue comebacks list (for needs-attention)
 * Hardened against null/undefined fields
 */
export const getOverdueComebacksList = async (limit = 10) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboardMetricsService.js:57',message:'getOverdueComebacksList entry',data:{limit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboardMetricsService.js:63',message:'querying cases',data:{today:today.toISOString(),hasCaseModel:!!CaseModel},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    // Only query cases with valid comeback_date (not null/undefined)
    const cases = await CaseModel.find({
      status: 'PendingComeback',
      comeback_date: { $exists: true, $ne: null, $lt: today }
    })
      .select('case_number status comeback_date assigned_officer_id check_in_id')
      .populate({
        path: 'assigned_officer_id',
        select: 'name',
        match: { _id: { $exists: true } } // Only populate if exists
      })
      .populate({
        path: 'check_in_id',
        select: 'business_id',
        populate: {
          path: 'business_id',
          select: 'business_name',
          match: { _id: { $exists: true } } // Only populate if exists
        },
        match: { _id: { $exists: true } } // Only populate if exists
      })
      .sort({ comeback_date: 1 })
      .limit(limit)
      .lean();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboardMetricsService.js:76',message:'query result before filter',data:{casesCount:cases?.length,firstCase:cases?.[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    // Filter out cases where populate failed (null references)
    const filtered = cases.filter(c => c && c.comeback_date);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboardMetricsService.js:79',message:'getOverdueComebacksList exit',data:{filteredCount:filtered.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return filtered;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboardMetricsService.js:82',message:'getOverdueComebacksList error',data:{errorMsg:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.error('[getOverdueComebacksList] Error:', error);
    return []; // Return empty array on error
  }
};

/**
 * Get aging/stale assessments
 * Definition: Cases with status UnderAssessment and lastActivityAt > 48 hours ago
 * Hardened against null/undefined fields
 */
export const getAgingAssessments = async (hoursThreshold = 48, limit = 10) => {
  try {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - hoursThreshold);
    
    // Build query with proper null handling
    const query = {
      status: 'UnderAssessment',
      $or: [
        { lastActivityAt: { $exists: true, $ne: null, $lt: threshold } },
        { 
          $and: [
            { lastActivityAt: { $exists: false } },
            { updatedAt: { $exists: true, $ne: null, $lt: threshold } }
          ]
        }
      ]
    };
    
    const cases = await CaseModel.find(query)
      .select('case_number status lastActivityAt updatedAt assigned_officer_id check_in_id')
      .populate({
        path: 'assigned_officer_id',
        select: 'name',
        match: { _id: { $exists: true } } // Only populate if exists
      })
      .populate({
        path: 'check_in_id',
        select: 'business_id',
        populate: {
          path: 'business_id',
          select: 'business_name',
          match: { _id: { $exists: true } } // Only populate if exists
        },
        match: { _id: { $exists: true } } // Only populate if exists
      })
      .sort({ lastActivityAt: 1, updatedAt: 1 }) // Oldest first
      .limit(limit)
      .lean();
    
    // Filter out cases where populate failed (null references)
    return cases.filter(c => c && (c.lastActivityAt || c.updatedAt));
  } catch (error) {
    console.error('[getAgingAssessments] Error:', error);
    return []; // Return empty array on error
  }
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
