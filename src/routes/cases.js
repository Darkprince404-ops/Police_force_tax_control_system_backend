import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { CaseTypes, CaseStatus, CaseResult } from '../constants/enums.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { CaseModel, CheckInModel, UserModel, BusinessModel } from '../models/index.js';
import { assertCheckInExists, nextCaseNumber } from '../services/caseService.js';
import { recordAudit } from '../services/auditService.js';
import { uploadCasePaper } from '../middleware/casePaperUpload.js';
import { extractDateFromFile } from '../services/ocrService.js';
import path from 'path';

const router = Router();

const createSchema = Joi.object({
  check_in_id: Joi.string().required(),
  case_type: Joi.string()
    .valid(...CaseTypes)
    .required(),
  description: Joi.string().allow('', null),
  violations: Joi.string().allow('', null),
  assigned_officer_id: Joi.string().allow(null),
  deadline_date: Joi.date().optional(),
});

router.post('/', requireAuth, requireRole(['officer', 'supervisor', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    await assertCheckInExists(value.check_in_id);
    if (value.assigned_officer_id) {
      const officer = await UserModel.findById(value.assigned_officer_id);
      if (!officer) throw createError(400, 'Assigned officer not found');
    }
    const case_number = await nextCaseNumber(new Date());
    const newCase = await CaseModel.create({
      ...value,
      case_number,
      status: 'Open',
    });
    await recordAudit({
      action: 'create',
      entity: 'case',
      entityId: newCase.id,
      userId: req.user?.sub,
      details: value,
    });
    res.status(201).json(newCase);
  } catch (err) {
    next(err);
  }
});

const updateSchema = Joi.object({
  case_type: Joi.string()
    .valid(...CaseTypes)
    .optional(),
  description: Joi.string().allow('', null),
  violations: Joi.string().allow('', null),
  status: Joi.string()
    .valid(...CaseStatus)
    .optional(),
  result: Joi.string()
    .valid(...CaseResult)
    .allow(null),
  assigned_officer_id: Joi.string().allow(null),
  deadline_date: Joi.date().optional(),
  comeback_date: Joi.date().optional(),
  fine_amount: Joi.number().min(0).optional(),
});

router.put('/:id', requireAuth, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    const updated = await CaseModel.findByIdAndUpdate(req.params.id, value, { new: true });
    if (!updated) throw createError(404, 'Not found');
    await recordAudit({
      action: 'update',
      entity: 'case',
      entityId: updated.id,
      userId: req.user?.sub,
      details: value,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Get cases for supervisor's officers
router.get('/my-team', requireAuth, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    // Get officers assigned to this supervisor
    const myOfficers = await UserModel.find({ supervisor_id: req.user.sub }).select('_id');
    const officerIds = myOfficers.map(o => o._id);
    
    if (officerIds.length === 0) {
      return res.json([]);
    }
    
    const { status, case_type } = req.query;
    const filter = { assigned_officer_id: { $in: officerIds } };
    if (status) filter.status = status;
    if (case_type) filter.case_type = case_type;
    
    const cases = await CaseModel.find(filter)
      .populate({
        path: 'check_in_id',
        select: 'fine business_id check_in_date',
        populate: {
          path: 'business_id',
          select: 'business_name business_type owner_name',
        },
      })
      .populate('assigned_officer_id', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(cases);
  } catch (err) {
    next(err);
  }
});

// Reassign case to another officer (supervisor can only reassign to their officers)
router.put('/:id/reassign', requireAuth, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { assigned_officer_id } = req.body;
    if (!assigned_officer_id) {
      throw createError(400, 'assigned_officer_id is required');
    }
    
    const caseItem = await CaseModel.findById(req.params.id);
    if (!caseItem) throw createError(404, 'Case not found');
    
    // If supervisor (not admin), verify both old and new officers are under their supervision
    if (req.user.role === 'supervisor') {
      const myOfficers = await UserModel.find({ supervisor_id: req.user.sub }).select('_id');
      const officerIds = myOfficers.map(o => o._id.toString());
      
      // Check if new officer is under this supervisor
      if (!officerIds.includes(assigned_officer_id)) {
        throw createError(403, 'You can only reassign cases to officers under your supervision');
      }
      
      // Check if current officer is under this supervisor
      if (caseItem.assigned_officer_id && !officerIds.includes(caseItem.assigned_officer_id.toString())) {
        throw createError(403, 'You can only reassign cases from officers under your supervision');
      }
    }
    
    // Verify new officer exists
    const newOfficer = await UserModel.findById(assigned_officer_id);
    if (!newOfficer) throw createError(400, 'Officer not found');
    
    const oldOfficerId = caseItem.assigned_officer_id;
    caseItem.assigned_officer_id = assigned_officer_id;
    await caseItem.save();
    
    await recordAudit({
      action: 'reassign',
      entity: 'case',
      entityId: caseItem.id,
      userId: req.user?.sub,
      details: { from_officer: oldOfficerId, to_officer: assigned_officer_id },
    });
    
    const updated = await CaseModel.findById(caseItem._id)
      .populate('assigned_officer_id', 'name email');
    
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, case_type, assigned_officer_id, business_name, business_type, start, end } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (case_type) filter.case_type = case_type;
    if (assigned_officer_id) filter.assigned_officer_id = assigned_officer_id;
    
    // If business filters are provided, we need to find matching businesses first
    let businessFilter = {};
    if (business_name) {
      businessFilter.business_name = { $regex: business_name, $options: 'i' };
    }
    if (business_type) {
      businessFilter.business_type = { $regex: business_type, $options: 'i' };
    }
    
    let cases;
    if (Object.keys(businessFilter).length > 0) {
      // Find businesses matching the filter
      const matchingBusinesses = await BusinessModel.find(businessFilter).select('_id');
      const businessIds = matchingBusinesses.map(b => b._id);
      
      // Find check-ins for these businesses
      const matchingCheckIns = await CheckInModel.find({ business_id: { $in: businessIds } }).select('_id');
      const checkInIds = matchingCheckIns.map(c => c._id);
      
      // Filter cases by check-in IDs
      filter.check_in_id = { $in: checkInIds };
    }
    
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(String(start));
      if (end) filter.createdAt.$lte = new Date(String(end));
    }

    cases = await CaseModel.find(filter)
      .populate({
        path: 'check_in_id',
        select: 'fine business_id check_in_date',
        populate: {
          path: 'business_id',
          select: 'business_name business_type owner_name',
        },
      })
      .populate('assigned_officer_id', 'name email')
      .lean();
    
    // Add evidence count to each case
    const { EvidenceModel } = await import('../models/index.js');
    const caseIds = cases.map(c => c._id);
    const evidenceCounts = await EvidenceModel.aggregate([
      { $match: { case_id: { $in: caseIds } } },
      { $group: { _id: '$case_id', count: { $sum: 1 } } },
    ]);
    
    const evidenceMap = {};
    evidenceCounts.forEach((ec) => {
      evidenceMap[ec._id.toString()] = ec.count;
    });
    
    cases = cases.map((c) => ({
      ...c,
      evidence_count: evidenceMap[c._id.toString()] || 0,
    }));
    
    cases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(cases);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const c = await CaseModel.findById(req.params.id)
      .populate({
        path: 'check_in_id',
        select: 'fine business_id check_in_date phone notes',
        populate: {
          path: 'business_id',
          select: 'business_name business_type owner_name business_id tax_id',
        },
      })
      .populate('assigned_officer_id', 'name email')
      .populate('resolution_papers.officer_id', 'name email')
      .lean();
    if (!c) throw createError(404, 'Not found');
    
    // Add evidence count
    const { EvidenceModel } = await import('../models/index.js');
    const evidenceCount = await EvidenceModel.countDocuments({ case_id: c._id });
    c.evidence_count = evidenceCount;
    
    res.json(c);
  } catch (err) {
    next(err);
  }
});

// Upload resolution paper
const paperUploadSchema = Joi.object({
  paper_type: Joi.string().valid('fine_paid', 'comeback_date').required(),
  notes: Joi.string().allow('', null),
});

router.post(
  '/:id/papers',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  uploadCasePaper.single('file'),
  async (req, res, next) => {
    try {
      const { error, value } = paperUploadSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      if (!req.file) throw createError(400, 'File is required');
      
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      
      // Extract date from file
      const extractedDate = await extractDateFromFile(req.file.path, req.file.mimetype);
      
      // Create paper object (without confirmed_date yet - will be set when officer confirms)
      const paperData = {
        paper_type: value.paper_type,
        file_url: `/uploads/case-papers/${path.basename(req.file.path)}`,
        extracted_date: extractedDate,
        officer_id: req.user?.sub,
        uploaded_at: new Date(),
        notes: value.notes || '',
      };
      
      // Add paper to case
      caseItem.resolution_papers.push(paperData);
      await caseItem.save();
      
      const savedPaper = caseItem.resolution_papers[caseItem.resolution_papers.length - 1];
      await savedPaper.populate('officer_id', 'name email');
      
      await recordAudit({
        action: 'create',
        entity: 'case_paper',
        entityId: savedPaper._id.toString(),
        userId: req.user?.sub,
        details: { case_id: caseItem.id, paper_type: value.paper_type },
      });
      
      res.status(201).json({
        paper: savedPaper,
        extracted_date: extractedDate,
        requires_confirmation: !!extractedDate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Confirm/correct paper date
const confirmPaperSchema = Joi.object({
  confirmed_date: Joi.date().required(),
  notes: Joi.string().allow('', null),
});

router.put(
  '/:id/papers/:paperId',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = confirmPaperSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      
      const paper = caseItem.resolution_papers.id(req.params.paperId);
      if (!paper) throw createError(404, 'Paper not found');
      
      // Update confirmed date and notes
      paper.confirmed_date = value.confirmed_date;
      if (value.notes !== undefined) {
        paper.notes = value.notes;
      }
      
      await caseItem.save();
      await paper.populate('officer_id', 'name email');
      
      await recordAudit({
        action: 'update',
        entity: 'case_paper',
        entityId: paper._id.toString(),
        userId: req.user?.sub,
        details: { confirmed_date: value.confirmed_date },
      });
      
      res.json(paper);
    } catch (err) {
      next(err);
    }
  },
);

// Decision endpoints for assessment workflow
const notGuiltySchema = Joi.object({
  notes: Joi.string().allow('', null),
});

router.post(
  '/:id/decision/not-guilty',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = notGuiltySchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      if (caseItem.status !== 'UnderAssessment') {
        throw createError(400, 'Case is not in assessment stage');
      }
      
      caseItem.status = 'NotGuilty';
      caseItem.result = 'Pass';
      if (value.notes) {
        caseItem.description = (caseItem.description || '') + '\n\nDecision: ' + value.notes;
      }
      
      await caseItem.save();
      await recordAudit({
        action: 'update',
        entity: 'case',
        entityId: caseItem.id,
        userId: req.user?.sub,
        details: { status: 'NotGuilty', decision: 'not_guilty' },
      });
      
      res.json(caseItem);
    } catch (err) {
      next(err);
    }
  },
);

const guiltyFineSchema = Joi.object({
  fine_amount: Joi.number().min(0).required(),
  notes: Joi.string().allow('', null),
});

router.post(
  '/:id/decision/guilty-fine',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = guiltyFineSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      if (caseItem.status !== 'UnderAssessment') {
        throw createError(400, 'Case is not in assessment stage');
      }
      
      caseItem.status = 'Fined';
      caseItem.result = 'Fail';
      caseItem.fine_amount = value.fine_amount;
      if (value.notes) {
        caseItem.description = (caseItem.description || '') + '\n\nDecision: ' + value.notes;
      }
      
      await caseItem.save();
      await recordAudit({
        action: 'update',
        entity: 'case',
        entityId: caseItem.id,
        userId: req.user?.sub,
        details: { status: 'Fined', fine_amount: value.fine_amount, decision: 'guilty_fine' },
      });
      
      res.json(caseItem);
    } catch (err) {
      next(err);
    }
  },
);

const guiltyComebackSchema = Joi.object({
  comeback_date: Joi.date().required(),
  notes: Joi.string().allow('', null),
});

router.post(
  '/:id/decision/guilty-comeback',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = guiltyComebackSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      if (caseItem.status !== 'UnderAssessment') {
        throw createError(400, 'Case is not in assessment stage');
      }
      
      caseItem.status = 'PendingComeback';
      caseItem.result = 'Fail';
      caseItem.comeback_date = new Date(value.comeback_date);
      caseItem.comeback_notification_sent = false;
      if (value.notes) {
        caseItem.description = (caseItem.description || '') + '\n\nDecision: ' + value.notes;
      }
      
      await caseItem.save();
      await recordAudit({
        action: 'update',
        entity: 'case',
        entityId: caseItem.id,
        userId: req.user?.sub,
        details: { status: 'PendingComeback', comeback_date: value.comeback_date, decision: 'guilty_comeback' },
      });
      
      res.json(caseItem);
    } catch (err) {
      next(err);
    }
  },
);

export const caseRoutes = router;

