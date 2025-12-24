import { Router } from 'express';
import { Parser } from 'json2csv';
import cron from 'node-cron';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { CaseModel, BusinessModel, CheckInModel, EvidenceModel, ReportScheduleModel } from '../models/index.js';
import { generateExcelReport, generatePDFReport } from '../services/reportExportService.js';

const router = Router();
const activeSchedules = new Map();

const sendCsv = (res, filename, fields, data) => {
  const parser = new Parser({ fields });
  const csv = parser.parse(data);
  res.header('Content-Type', 'text/csv');
  res.attachment(filename);
  res.send(csv);
};

const scheduleJob = (scheduleDoc) => {
  if (!scheduleDoc || !scheduleDoc.cron) return;
  if (activeSchedules.has(scheduleDoc.id)) {
    activeSchedules.get(scheduleDoc.id)?.stop();
  }
  const job = cron.schedule(scheduleDoc.cron, async () => {
    console.log(`[report schedule] ${scheduleDoc.report_type} → ${scheduleDoc.email}`);
    scheduleDoc.last_run_at = new Date();
    await scheduleDoc.save();
  });
  activeSchedules.set(scheduleDoc.id, job);
};

// Dashboard stats endpoint
router.get(
  '/dashboard-stats',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = {};

      // Only apply date filter when a range is provided; otherwise use all data
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0); // epoch if not provided
        start.setHours(0, 0, 0, 0);
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        dateFilter = { createdAt: { $gte: start, $lte: end } };
      }

      // Cases by type
      const casesByType = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$case_type', count: { $sum: 1 } } },
        { $project: { case_type: '$_id', count: 1, _id: 0 } },
      ]);

      // Cases by status
      const casesByStatus = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]);

      // Cases over time (daily)
      const casesOverTime = await CaseModel.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]);

      // Officer workload
      const officerWorkload = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$assigned_officer_id', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'officer',
          },
        },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { officer_id: '$_id', officer_name: '$officer.name', cases: '$count', _id: 0 } },
        { $sort: { cases: -1 } },
        { $limit: 10 },
      ]);

      // Business registrations over time
      const businessRegistrations = await BusinessModel.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]);

      // Case resolution rate
      const totalCases = await CaseModel.countDocuments(dateFilter);
      const resolvedCases = await CaseModel.countDocuments({
        ...dateFilter,
        status: { $in: ['Resolved', 'Closed'] },
      });
      const resolutionRate = totalCases > 0 ? (resolvedCases / totalCases) * 100 : 0;

      res.json({
        casesByType,
        casesByStatus,
        casesOverTime,
        officerWorkload,
        businessRegistrations,
        resolutionRate: Math.round(resolutionRate * 100) / 100,
        totalCases,
        resolvedCases,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/cases-summary',
  requireAuth,
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$case_type', count: { $sum: 1 } } },
        { $project: { case_type: '$_id', count: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/cases-summary.csv',
  requireAuth,
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$case_type', count: { $sum: 1 } } },
        { $project: { case_type: '$_id', count: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      sendCsv(res, 'cases-summary.csv', ['case_type', 'count'], data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/status-summary',
  requireAuth,
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/status-summary.csv',
  requireAuth,
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      sendCsv(res, 'status-summary.csv', ['status', 'count'], data);
    } catch (err) {
      next(err);
    }
  },
);

// Cohort/trend analytics
router.get(
  '/analytics/trends',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (_req, res, next) => {
    try {
      const trend = await CaseModel.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            cases: { $sum: 1 },
            fines: { $sum: { $ifNull: ['$fine_amount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { month: '$_id', cases: 1, fines: 1, _id: 0 } },
      ]);
      res.json({ trend });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/officer-workload',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$assigned_officer_id', cases: { $sum: 1 } } },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'officer',
          },
        },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { officer_id: '$_id', officer_name: '$officer.name', cases: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/officer-workload.csv',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $group: { _id: '$assigned_officer_id', cases: { $sum: 1 } } },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'officer',
          },
        },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { officer_id: '$_id', officer_name: '$officer.name', cases: 1, _id: 0 } },
      ];
      const data = await CaseModel.aggregate(pipeline);
      sendCsv(res, 'officer-workload.csv', ['officer_id', 'officer_name', 'cases'], data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/repeated-offenders',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $lookup: { from: 'checkins', localField: 'check_in_id', foreignField: '_id', as: 'check' } },
        { $unwind: '$check' },
        { $group: { 
          _id: '$check.business_id', 
          cases: { $sum: 1 },
          totalFine: { $sum: { $ifNull: ['$check.fine', 0] } }
        } },
        { $match: { cases: { $gte: 2 } } },
        { $project: { business_id: '$_id', cases: 1, totalFine: 1, _id: 0 } },
      ];
      const offenders = await CaseModel.aggregate(pipeline);

      const businessIds = offenders.map((o) => o.business_id);
      const businesses = await BusinessModel.find({ _id: { $in: businessIds } }).select(
        'business_name tax_id',
      );
      const data = offenders.map((o) => {
        const b = businesses.find((biz) => biz.id === String(o.business_id));
        return {
          business_id: o.business_id,
          business_name: b?.business_name || '',
          tax_id: b?.tax_id || '',
          cases: o.cases,
          totalFine: o.totalFine || 0,
        };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/repeated-offenders.csv',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (_req, res, next) => {
    try {
      const pipeline = [
        { $lookup: { from: 'checkins', localField: 'check_in_id', foreignField: '_id', as: 'check' } },
        { $unwind: '$check' },
        { $group: { _id: '$check.business_id', cases: { $sum: 1 } } },
        { $match: { cases: { $gte: 2 } } },
        { $project: { business_id: '$_id', cases: 1, _id: 0 } },
      ];
      const offenders = await CaseModel.aggregate(pipeline);
      const businessIds = offenders.map((o) => o.business_id);
      const businesses = await BusinessModel.find({ _id: { $in: businessIds } }).select(
        'business_name tax_id',
      );
      const data = offenders.map((o) => {
        const b = businesses.find((biz) => biz.id === String(o.business_id));
        return {
          business_id: o.business_id,
          business_name: b?.business_name || '',
          tax_id: b?.tax_id || '',
          cases: o.cases,
        };
      });
      sendCsv(res, 'repeated-offenders.csv', ['business_id', 'business_name', 'tax_id', 'cases'], data);
    } catch (err) {
      next(err);
    }
  },
);

// Case reports endpoint with filtering
router.get(
  '/cases',
  requireAuth,
  async (req, res, next) => {
    try {
      const { case_type, status, startDate, endDate, business_name, business_type } = req.query;
      const filter = {};
      
      if (case_type) filter.case_type = case_type;
      if (status) filter.status = status;
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          filter.createdAt.$gte = start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }
      
      // Apply business filters if provided
      if (business_name || business_type) {
        const businessFilter = {};
        if (business_name) {
          businessFilter.business_name = { $regex: business_name, $options: 'i' };
        }
        if (business_type) {
          businessFilter.business_type = { $regex: business_type, $options: 'i' };
        }
        
        const matchingBusinesses = await BusinessModel.find(businessFilter).select('_id');
        const businessIds = matchingBusinesses.map(b => b._id);
        
        const matchingCheckIns = await CheckInModel.find({ business_id: { $in: businessIds } }).select('_id');
        const checkInIds = matchingCheckIns.map(c => c._id);
        
        filter.check_in_id = { $in: checkInIds };
      }
      
      const cases = await CaseModel.find(filter)
        .populate({
          path: 'check_in_id',
          select: 'fine business_id check_in_date phone notes',
          populate: {
            path: 'business_id',
            select: 'business_name business_type tax_id',
          },
        })
        .populate('assigned_officer_id', 'name email')
        .sort({ createdAt: -1 });
      
      res.json(cases);
    } catch (err) {
      next(err);
    }
  },
);

// Enhanced export endpoint (admin-only for officer workload, users; all users for cases)
router.get(
  '/export/:reportType',
  requireAuth,
  async (req, res, next) => {
    try {
      const { reportType } = req.params;
      const { format, startDate, endDate, case_type, status, business_name, business_type } = req.query;
      
      // Admin-only reports
      const adminOnlyReports = ['officer-workload', 'users', 'officers'];
      if (adminOnlyReports.includes(reportType) && req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      // Optional date range; if not provided, export all data
      const start = startDate ? new Date(startDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      // Build business filter if provided
      let businessFilter = {};
      if (business_name) {
        businessFilter.business_name = { $regex: business_name, $options: 'i' };
      }
      if (business_type) {
        businessFilter.business_type = { $regex: business_type, $options: 'i' };
      }
      
      let checkInFilter = {};
      if (Object.keys(businessFilter).length > 0) {
        const matchingBusinesses = await BusinessModel.find(businessFilter).select('_id');
        const businessIds = matchingBusinesses.map(b => b._id);
        checkInFilter.business_id = { $in: businessIds };
      }

      if (format === 'excel' || format === 'xlsx') {
        const buffer = await generateExcelReport(reportType, start || undefined, end || undefined, { 
          case_type: case_type || undefined, 
          status: status || undefined,
          business_name: business_name || undefined,
          business_type: business_type || undefined,
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${startDate || 'all'}.xlsx"`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await generatePDFReport(reportType, start || undefined, end || undefined, { 
          case_type: case_type || undefined, 
          status: status || undefined,
          business_name: business_name || undefined,
          business_type: business_type || undefined,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${startDate || 'all'}.pdf"`);
        res.send(buffer);
      } else {
        // Default to CSV
        let fields = [];
        let data = [];

        switch (reportType) {
          case 'cases':
          case 'cases-summary':
            const caseFilter = {};
            if (start || end) {
              caseFilter.createdAt = {};
              if (start) caseFilter.createdAt.$gte = start;
              if (end) caseFilter.createdAt.$lte = end;
            }
            if (case_type) caseFilter.case_type = case_type;
            if (status) caseFilter.status = status;
            
            // Apply business filter through check-ins
            if (Object.keys(checkInFilter).length > 0) {
              const matchingCheckIns = await CheckInModel.find(checkInFilter).select('_id');
              const checkInIds = matchingCheckIns.map(c => c._id);
              caseFilter.check_in_id = { $in: checkInIds };
            }
            
            data = await CaseModel.find(caseFilter)
              .populate({
                path: 'check_in_id',
                select: 'fine business_id check_in_date phone',
                populate: {
                  path: 'business_id',
                  select: 'business_name business_type owner_name business_id tax_id',
                },
              })
              .populate('assigned_officer_id', 'name email')
              .select('case_number case_type status description createdAt check_in_id assigned_officer_id')
              .sort({ createdAt: -1 })
              .lean();
            
            // Fetch evidence URLs
            const caseIds = data.map((c) => c._id);
            const evidenceList = await EvidenceModel.find({ case_id: { $in: caseIds } }).lean();
            const evidenceMap = {};
            evidenceList.forEach((ev) => {
              const key = ev.case_id.toString();
              if (!evidenceMap[key]) evidenceMap[key] = [];
              evidenceMap[key].push(ev.file_url);
            });
            
            // Transform data for CSV
            data = data.map(c => ({
              case_number: c.case_number,
              case_type: c.case_type,
              status: c.status,
              description: c.description || '',
              created_at: c.createdAt,
              fine: c.check_in_id?.fine || 0,
              business_name: c.check_in_id?.business_id?.business_name || '',
              business_type: c.check_in_id?.business_id?.business_type || '',
              owner_name: c.check_in_id?.business_id?.owner_name || '',
              business_id: c.check_in_id?.business_id?._id || '',
              business_tax_id: c.check_in_id?.business_id?.tax_id || '',
              phone: c.check_in_id?.phone || '',
              assigned_officer: c.assigned_officer_id?.name || '',
              evidence_urls: (evidenceMap[c._id.toString()] || []).map((u) => `http://localhost:4000${u}`).join('|'),
            }));
            fields = ['case_number', 'case_type', 'status', 'description', 'fine', 'business_name', 'business_type', 'owner_name', 'business_id', 'business_tax_id', 'phone', 'assigned_officer', 'evidence_urls', 'created_at'];
            break;
          case 'cases-summary':
            data = await CaseModel.aggregate([
              { $match: { createdAt: { $gte: start, $lte: end } } },
              { $group: { _id: '$case_type', count: { $sum: 1 } } },
              { $project: { case_type: '$_id', count: 1, _id: 0 } },
            ]);
            fields = ['case_type', 'count'];
            break;
          case 'status-summary':
            data = await CaseModel.aggregate([
              { $match: { createdAt: { $gte: start, $lte: end } } },
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $project: { status: '$_id', count: 1, _id: 0 } },
            ]);
            fields = ['status', 'count'];
            break;
          default:
            throw new Error('Invalid report type');
        }
        sendCsv(res, `${reportType}-${startDate || 'all'}.csv`, fields, data);
      }
    } catch (err) {
      next(err);
    }
  },
);

// Report scheduling (store + cron hook)
router.post(
  '/schedule',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { email, report_type, format = 'excel', cron: cronExp, filters = {} } = req.body;
      if (!email || !report_type || !cronExp) {
        return res.status(400).json({ message: 'email, report_type, cron are required' });
      }
      const schedule = await ReportScheduleModel.create({
        email,
        report_type,
        format,
        cron: cronExp,
        filters,
      });
      scheduleJob(schedule);
      res.status(201).json(schedule);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/schedule',
  requireAuth,
  requireRole(['admin']),
  async (_req, res, next) => {
    try {
      const schedules = await ReportScheduleModel.find().sort({ createdAt: -1 });
      res.json(schedules);
    } catch (err) {
      next(err);
    }
  },
);

// Case papers report (admin-only)
router.get(
  '/case-papers',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { paper_type, startDate, endDate } = req.query;
      const filter = { 'resolution_papers.0': { $exists: true } };
      
      if (paper_type) {
        filter['resolution_papers.paper_type'] = paper_type;
      }
      
      if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          dateFilter.$gte = start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          dateFilter.$lte = end;
        }
        filter['resolution_papers.uploaded_at'] = dateFilter;
      }
      
      const cases = await CaseModel.find(filter)
        .populate({
          path: 'check_in_id',
          select: 'business_id',
          populate: {
            path: 'business_id',
            select: 'business_name',
          },
        })
        .populate('resolution_papers.officer_id', 'name email')
        .select('case_number resolution_papers check_in_id')
        .lean();
      
      // Flatten papers with case info
      const papers = [];
      cases.forEach((c) => {
        if (c.resolution_papers && c.resolution_papers.length > 0) {
          c.resolution_papers.forEach((paper) => {
            if (!paper_type || paper.paper_type === paper_type) {
              const checkIn = c.check_in_id;
              const business = checkIn?.business_id;
              
              papers.push({
                case_number: c.case_number,
                business_name: business?.business_name || 'N/A',
                paper_type: paper.paper_type,
                confirmed_date: paper.confirmed_date,
                extracted_date: paper.extracted_date,
                officer_name: paper.officer_id?.name || 'Unknown',
                officer_email: paper.officer_id?.email || '',
                uploaded_at: paper.uploaded_at,
                notes: paper.notes || '',
              });
            }
          });
        }
      });
      
      res.json(papers);
    } catch (err) {
      next(err);
    }
  },
);

export const reportRoutes = router;

