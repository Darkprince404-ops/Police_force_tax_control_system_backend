import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { BusinessModel, CheckInModel, CaseModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';
import { getOrCreateType } from '../services/businessTypeService.js';
import { nextCaseNumber } from '../services/caseService.js';
import { CaseTypes } from '../constants/enums.js';

const router = Router();

const checkInSchema = Joi.object({
  business_id: Joi.string().required(),
  check_in_date: Joi.date().required(),
  location_geo: Joi.string().allow('', null),
  phone: Joi.string().allow('', null),
  fine: Joi.number().min(0).allow(null),
  notes: Joi.string().allow('', null),
  business_type: Joi.string().allow('', null),
  case_type: Joi.string().valid(...CaseTypes).allow('', null), // Optional case type
});

router.post('/', requireAuth, requireRole(['officer', 'supervisor', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = checkInSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    const business = await BusinessModel.findById(value.business_id);
    if (!business) throw createError(400, 'Business not found');

    // Handle business type if provided
    if (value.business_type && value.business_type.trim()) {
      const businessType = await getOrCreateType(value.business_type);
      business.business_type = businessType.display_name;
      business.business_type_id = businessType.id;
      await business.save();
    }

    const checkIn = await CheckInModel.create({
      business_id: value.business_id,
      check_in_date: value.check_in_date,
      location_geo: value.location_geo,
      phone: value.phone || null,
      fine: value.fine || 0,
      notes: value.notes,
      officer_id: req.user?.sub,
    });

    // Automatically create a case in "UnderAssessment" status
    const case_number = await nextCaseNumber(new Date(value.check_in_date));
    const newCase = await CaseModel.create({
      check_in_id: checkIn.id,
      case_type: value.case_type || 'OTHER',
      case_number,
      description: value.notes || `Assessment case for ${business.business_name}`,
      status: 'UnderAssessment',
      assigned_officer_id: req.user?.sub,
    });

    await recordAudit({
      action: 'create',
      entity: 'checkin',
      entityId: checkIn.id,
      userId: req.user?.sub,
      details: value,
    });

    await recordAudit({
      action: 'create',
      entity: 'case',
      entityId: newCase.id,
      userId: req.user?.sub,
      details: { check_in_id: checkIn.id, status: 'UnderAssessment' },
    });

    res.status(201).json({ ...checkIn.toObject(), case_id: newCase.id, case_number: newCase.case_number });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const checkIn = await CheckInModel.findById(req.params.id);
    if (!checkIn) throw createError(404, 'Not found');
    res.json(checkIn);
  } catch (err) {
    next(err);
  }
});

export const checkInRoutes = router;

