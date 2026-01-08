import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { BusinessModel, CheckInModel, CaseModel, EditRequestModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';
import { generateBusinessId } from '../utils/businessId.js';
import { generateTaxId } from '../utils/taxId.js';
import { generateRegistrationNumber } from '../utils/registrationNumber.js';
import { uploadOwnerId } from '../utils/gridfsStorage.js';
import { deleteFromGridFS } from '../utils/gridfs.js';

const router = Router();

const businessSchema = Joi.object({
  business_name: Joi.string().required(),
  owner_name: Joi.string().allow('', null),
  address: Joi.string().allow('', null),
  contact_phone: Joi.string().allow('', null),
  contact_email: Joi.string().email().allow('', null),
  business_type: Joi.string().allow('', null),
  business_type_id: Joi.string().allow('', null), // Allow business_type_id for linking to BusinessType collection
  tax_id: Joi.string().allow('', null), // Auto-generated if not provided
  registration_number: Joi.string().allow('', null), // Auto-generated if not provided
  state: Joi.string().allow('', null), // Somali state/region
  district: Joi.string().allow('', null), // District (especially for Mogadishu)
});

router.post('/', requireAuth, requireRole(['officer', 'supervisor', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = businessSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    
    // Auto-generate business_id if not provided
    if (!value.business_id) {
      value.business_id = await generateBusinessId();
    }
    
    // Auto-generate tax_id if not provided
    if (!value.tax_id || value.tax_id.trim() === '') {
      value.tax_id = await generateTaxId();
    }
    
    // Auto-generate registration_number if not provided
    if (!value.registration_number || value.registration_number.trim() === '') {
      value.registration_number = await generateRegistrationNumber();
    }
    
    // Only include business_type_id if it's provided and not empty
    if (value.business_type_id === null || value.business_type_id === '' || (typeof value.business_type_id === 'string' && value.business_type_id.trim() === '')) {
      delete value.business_type_id;
    }
    
    const business = await BusinessModel.create(value);
    await recordAudit({
      action: 'create',
      entity: 'business',
      entityId: business.id,
      userId: req.user?.sub,
      details: value,
    });
    res.status(201).json(business);
  } catch (err) {
    next(err);
  }
});

// Get total count of businesses
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    console.log('[Businesses Count] Fetching count...');
    const count = await BusinessModel.countDocuments();
    console.log('[Businesses Count] Result:', count);
    res.json({ count });
  } catch (err) {
    console.error('[Businesses Count] Error:', err.message);
    console.error('[Businesses Count] Stack:', err.stack);
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { q, tax_id, business_type, start, end } = req.query;
    let filter = {};
    
    if (q) {
      const searchTerm = String(q).trim();
      // Use MongoDB text search for full-text search across indexed fields
      filter.$text = { $search: searchTerm };
    }
    if (tax_id) filter.tax_id = tax_id;
    if (business_type) filter.business_type = business_type;
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(String(start));
      if (end) filter.createdAt.$lte = new Date(String(end));
    }
    
    const businesses = await BusinessModel.find(filter)
      .limit(100)
      .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 });
    
    res.json(businesses);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const business = await BusinessModel.findById(req.params.id);
    if (!business) throw createError(404, 'Not found');
    res.json(business);
  } catch (err) {
    next(err);
  }
});

// Upload owner ID image
router.post(
  '/:id/owner-id-image',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  uploadOwnerId.single('image'),
  async (req, res, next) => {
    try {
      const business = await BusinessModel.findById(req.params.id);
      if (!business) throw createError(404, 'Business not found');

      if (!req.file) {
        throw createError(400, 'No file uploaded');
      }

      console.log('[Owner ID Upload] File uploaded to GridFS:', {
        fileId: req.file.fileId,
        path: req.file.path,
        filename: req.file.filename,
      });

      // Delete old image from GridFS if exists
      if (business.owner_id_image_file_id) {
        try {
          await deleteFromGridFS(business.owner_id_image_file_id);
          console.log('[Owner ID Upload] Deleted old image:', business.owner_id_image_file_id);
        } catch (err) {
          console.error('[Owner ID Upload] Failed to delete old image:', err);
        }
      }

      // Store GridFS file ID and URL
      business.owner_id_image_file_id = req.file.fileId;
      business.owner_id_image_url = req.file.path; // This is the URL path like /api/files/:fileId
      await business.save();

      await recordAudit({
        action: 'update',
        entity: 'business',
        entityId: business.id,
        userId: req.user?.sub,
        details: { owner_id_image_uploaded: true, storageType: 'gridfs', fileId: req.file.fileId },
      });

      res.json(business);
    } catch (err) {
      console.error('[Owner ID Upload] Error:', err);
      next(err);
    }
  },
);

// Get owner ID image - redirects to GridFS file endpoint
router.get('/:id/owner-id-image', requireAuth, async (req, res, next) => {
  try {
    const business = await BusinessModel.findById(req.params.id);
    if (!business) {
      throw createError(404, 'Business not found');
    }
    
    if (!business.owner_id_image_file_id && !business.owner_id_image_url) {
      throw createError(404, 'Image not found');
    }

    // If we have a file ID (GridFS), redirect to the file endpoint
    if (business.owner_id_image_file_id) {
      return res.redirect(`/api/files/${business.owner_id_image_file_id}`);
    }
    
    // If it's a URL (legacy or external), redirect to it
    if (business.owner_id_image_url.startsWith('http') || business.owner_id_image_url.startsWith('/api/')) {
      return res.redirect(business.owner_id_image_url);
    }

    throw createError(404, 'Image not found');
  } catch (err) {
    next(err);
  }
});

// Update business (admin only - all fields)
router.put(
  '/:id',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { error, value } = businessSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      
      const business = await BusinessModel.findById(req.params.id);
      if (!business) throw createError(404, 'Business not found');

      // Only include business_type_id if it's provided and not empty
      if (value.business_type_id === null || value.business_type_id === '' || (typeof value.business_type_id === 'string' && value.business_type_id.trim() === '')) {
        delete value.business_type_id;
      }

      Object.assign(business, value);
      await business.save();

      await recordAudit({
        action: 'update',
        entity: 'business',
        entityId: business.id,
        userId: req.user?.sub,
        details: value,
      });

      res.json(business);
    } catch (err) {
      next(err);
    }
  },
);

// Update fine amount (requires approved edit request or admin)
router.put(
  '/:id/fine',
  requireAuth,
  async (req, res, next) => {
    try {
      const { fine_amount } = req.body;
      const isAdmin = req.user?.role === 'admin';

      if (!fine_amount && fine_amount !== 0) {
        throw createError(400, 'fine_amount is required');
      }

      const business = await BusinessModel.findById(req.params.id);
      if (!business) throw createError(404, 'Business not found');

      // Check if user has an approved edit request for fine_amount
      if (!isAdmin) {
        const approvedRequest = await EditRequestModel.findOne({
          business_id: req.params.id,
          requested_by: req.user?.sub,
          field_to_edit: 'fine_amount',
          status: 'approved',
        });

        if (!approvedRequest) {
          throw createError(403, 'You need an approved edit request to update the fine amount');
        }

        // Mark request as used (optional - you might want to keep it for history)
        // For now, we'll just check it exists
      }

      // Find all check-ins for this business
      const checkIns = await CheckInModel.find({ business_id: req.params.id }).sort({ createdAt: -1 });
      const checkInIds = checkIns.map((ci) => ci._id);

      if (checkInIds.length === 0) {
        // No check-ins exist - create a new check-in and case with the fine
        const newCheckIn = await CheckInModel.create({
          business_id: req.params.id,
          officer_id: req.user?.sub,
          check_in_date: new Date(),
          fine: fine_amount,
          notes: 'Fine updated via edit request',
        });

        const { nextCaseNumber } = await import('../services/caseService.js');
        const caseNumber = await nextCaseNumber(new Date());

        await CaseModel.create({
          check_in_id: newCheckIn._id,
          case_type: 'OTHER',
          case_number: caseNumber,
          description: 'Fine updated via edit request',
          status: 'UnderAssessment',
          fine_amount: fine_amount,
          assigned_officer_id: req.user?.sub,
        });
      } else {
        // Find active cases first (UnderAssessment status)
        let targetCase = await CaseModel.findOne({
          check_in_id: { $in: checkInIds },
          status: 'UnderAssessment',
        }).sort({ createdAt: -1 });

        // If no active case, get the most recent case
        if (!targetCase) {
          targetCase = await CaseModel.findOne({
            check_in_id: { $in: checkInIds },
          }).sort({ createdAt: -1 });
        }

        if (targetCase) {
          // Calculate current total fine
          const allCases = await CaseModel.find({ check_in_id: { $in: checkInIds } }).lean();
          const currentTotalFine = allCases.reduce((sum, c) => sum + (c.fine_amount || 0), 0);
          const difference = fine_amount - currentTotalFine;

          // Update the target case's fine_amount
          targetCase.fine_amount = (targetCase.fine_amount || 0) + difference;
          if (targetCase.fine_amount < 0) targetCase.fine_amount = 0;
          await targetCase.save();

          // Also update the related check-in's fine if it exists
          const checkIn = await CheckInModel.findById(targetCase.check_in_id);
          if (checkIn) {
            checkIn.fine = targetCase.fine_amount;
            await checkIn.save();
          }
        } else {
          // No cases exist but check-ins do - create a case
          const { nextCaseNumber } = await import('../services/caseService.js');
          const caseNumber = await nextCaseNumber(new Date());
          const mostRecentCheckIn = checkIns[0];

          await CaseModel.create({
            check_in_id: mostRecentCheckIn._id,
            case_type: 'OTHER',
            case_number: caseNumber,
            description: 'Fine updated via edit request',
            status: 'UnderAssessment',
            fine_amount: fine_amount,
            assigned_officer_id: req.user?.sub,
          });

          mostRecentCheckIn.fine = fine_amount;
          await mostRecentCheckIn.save();
        }
      }

      await recordAudit({
        action: 'update',
        entity: 'business',
        entityId: business.id,
        userId: req.user?.sub,
        details: { fine_amount, field: 'fine_amount' },
      });

      // Calculate new total fine
      const updatedCheckIns = await CheckInModel.find({ business_id: req.params.id });
      const updatedCheckInIds = updatedCheckIns.map((ci) => ci._id);
      const cases = await CaseModel.find({ check_in_id: { $in: updatedCheckInIds } }).lean();
      const newTotalFine = cases.reduce((sum, c) => sum + (c.fine_amount || 0), 0);

      res.json({
        business,
        fine_amount: newTotalFine,
        message: 'Fine amount updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },
);

export const businessRoutes = router;

