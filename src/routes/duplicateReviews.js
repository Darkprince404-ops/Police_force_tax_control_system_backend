import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { DuplicateReviewModel, BusinessModel, CheckInModel, CaseModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';
import { generateBusinessId } from '../utils/businessId.js';
import { generateCaseNumber } from '../utils/caseNumber.js';

const router = Router();

// Get all pending duplicate reviews
router.get('/', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    console.log('[Duplicate Reviews] Fetching reviews with status:', req.query.status || 'pending');
    const { status = 'pending', importJobId } = req.query;
    
    const query = { status };
    if (importJobId) {
      query.import_job_id = importJobId;
    }
    
    const reviews = await DuplicateReviewModel.find(query)
      .populate('existing_business_id')
      .populate('reviewed_by', 'name email')
      .populate('import_job_id')
      .sort({ createdAt: -1 });
    
    console.log('[Duplicate Reviews] Found', reviews.length, 'reviews');
    res.json(reviews);
  } catch (err) {
    console.error('[Duplicate Reviews] Error:', err.message);
    console.error('[Duplicate Reviews] Stack:', err.stack);
    next(err);
  }
});

// Get a single duplicate review
router.get('/:id', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const review = await DuplicateReviewModel.findById(req.params.id)
      .populate('existing_business_id')
      .populate('reviewed_by', 'name email')
      .populate('import_job_id');
    
    if (!review) throw createError(404, 'Duplicate review not found');
    
    res.json(review);
  } catch (err) {
    next(err);
  }
});

// Review decision schema
const reviewDecisionSchema = Joi.object({
  decision: Joi.string().valid('keep', 'delete', 'merge').required(),
  notes: Joi.string().allow('', null),
});

// Make a decision on a duplicate review
router.post('/:id/decide', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { error, value } = reviewDecisionSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    
    const review = await DuplicateReviewModel.findById(req.params.id)
      .populate('existing_business_id');
    
    if (!review) throw createError(404, 'Duplicate review not found');
    if (review.status !== 'pending') {
      throw createError(400, 'This review has already been processed');
    }
    
    const { decision, notes } = value;
    
    if (decision === 'delete') {
      // Mark as rejected - don't create the new business
      review.status = 'rejected';
      review.decision = 'delete';
      review.reviewed_by = req.user?.sub;
      review.reviewed_at = new Date();
      review.notes = notes;
      await review.save();
      
      await recordAudit({
        action: 'update',
        entity: 'duplicate_review',
        entityId: review.id,
        userId: req.user?.sub,
        details: { decision: 'delete', reason: 'Duplicate - deleted' },
      });
      
      res.json({ 
        message: 'Duplicate marked for deletion',
        review: review.toObject(),
      });
      
    } else if (decision === 'keep') {
      // Create the new business - it's a different business
      const newBusiness = await BusinessModel.create({
        business_id: await generateBusinessId(),
        business_name: review.new_business_data.business_name,
        owner_name: review.new_business_data.owner_name,
        address: review.new_business_data.address,
        contact_phone: review.new_business_data.contact_phone,
        contact_email: review.new_business_data.contact_email,
        business_type: review.new_business_data.business_type,
        tax_id: review.new_business_data.tax_id,
        district: review.new_business_data.district,
      });
      
      // Create check-in if we have fine amount or case
      if (review.new_business_data.fined_amount || review.new_business_data.case_field) {
        const checkInData = {
          business_id: newBusiness._id,
          officer_id: req.user?.sub,
          check_in_date: review.new_business_data.case_date || new Date(),
          notes: 'Imported after duplicate review - approved as different business',
        };
        
        if (review.new_business_data.fined_amount) {
          checkInData.fine = review.new_business_data.fined_amount;
        }
        
        const checkIn = await CheckInModel.create(checkInData);
        
        // Create case if we have case field
        if (review.new_business_data.case_field) {
          const caseStr = String(review.new_business_data.case_field).trim();
          const upperCaseStr = caseStr.toUpperCase();
          let caseType = 'OTHER';
          if (upperCaseStr.includes('TCC')) caseType = 'TCC';
          if (upperCaseStr.includes('EVC')) caseType = 'EVC';
          
          const caseNumber = generateCaseNumber(new Date(), 1);
          await CaseModel.create({
            check_in_id: checkIn._id,
            case_type: caseType,
            case_number: caseNumber,
            description: caseStr,
            status: 'UnderAssessment',
            assigned_officer_id: req.user?.sub,
            fine_amount: review.new_business_data.fined_amount || 0,
          });
        }
      }
      
      // Mark review as approved
      review.status = 'approved';
      review.decision = 'keep';
      review.reviewed_by = req.user?.sub;
      review.reviewed_at = new Date();
      review.notes = notes;
      await review.save();
      
      await recordAudit({
        action: 'create',
        entity: 'business',
        entityId: newBusiness.id,
        userId: req.user?.sub,
        details: { fromDuplicateReview: review.id, decision: 'keep' },
      });
      
      res.json({ 
        message: 'Business created - different business confirmed',
        business: newBusiness,
        review: review.toObject(),
      });
      
    } else if (decision === 'merge') {
      // Merge data into existing business
      const existingBusiness = review.existing_business_id;
      const updateData = {};
      
      // Only update fields that are missing in existing business
      if (!existingBusiness.owner_name && review.new_business_data.owner_name) {
        updateData.owner_name = review.new_business_data.owner_name;
      }
      if (!existingBusiness.address && review.new_business_data.address) {
        updateData.address = review.new_business_data.address;
      }
      if (!existingBusiness.contact_phone && review.new_business_data.contact_phone) {
        updateData.contact_phone = review.new_business_data.contact_phone;
      }
      if (!existingBusiness.contact_email && review.new_business_data.contact_email) {
        updateData.contact_email = review.new_business_data.contact_email;
      }
      if (!existingBusiness.district && review.new_business_data.district) {
        updateData.district = review.new_business_data.district;
      }
      
      if (Object.keys(updateData).length > 0) {
        await BusinessModel.updateOne({ _id: existingBusiness._id }, updateData);
      }
      
      // Create check-in if we have new data
      if (review.new_business_data.fined_amount || review.new_business_data.case_field) {
        const checkInData = {
          business_id: existingBusiness._id,
          officer_id: req.user?.sub,
          check_in_date: review.new_business_data.case_date || new Date(),
          notes: 'Imported after duplicate review - merged with existing business',
        };
        
        if (review.new_business_data.fined_amount) {
          checkInData.fine = review.new_business_data.fined_amount;
        }
        
        const checkIn = await CheckInModel.create(checkInData);
        
        // Create case if we have case field
        if (review.new_business_data.case_field) {
          const caseStr = String(review.new_business_data.case_field).trim();
          const upperCaseStr = caseStr.toUpperCase();
          let caseType = 'OTHER';
          if (upperCaseStr.includes('TCC')) caseType = 'TCC';
          if (upperCaseStr.includes('EVC')) caseType = 'EVC';
          
          const caseNumber = generateCaseNumber(new Date(), 1);
          await CaseModel.create({
            check_in_id: checkIn._id,
            case_type: caseType,
            case_number: caseNumber,
            description: caseStr,
            status: 'UnderAssessment',
            assigned_officer_id: req.user?.sub,
            fine_amount: review.new_business_data.fined_amount || 0,
          });
        }
      }
      
      // Mark review as merged
      review.status = 'merged';
      review.decision = 'merge';
      review.reviewed_by = req.user?.sub;
      review.reviewed_at = new Date();
      review.notes = notes;
      await review.save();
      
      await recordAudit({
        action: 'update',
        entity: 'business',
        entityId: existingBusiness.id,
        userId: req.user?.sub,
        details: { fromDuplicateReview: review.id, decision: 'merge' },
      });
      
      res.json({ 
        message: 'Data merged into existing business',
        business: existingBusiness,
        review: review.toObject(),
      });
    }
    
  } catch (err) {
    next(err);
  }
});

// Bulk decide on multiple reviews
router.post('/bulk-decide', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { reviewIds, decision, notes } = req.body;
    
    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
      throw createError(400, 'reviewIds array is required');
    }
    
    if (!['keep', 'delete', 'merge'].includes(decision)) {
      throw createError(400, 'Invalid decision. Must be keep, delete, or merge');
    }
    
    const results = [];
    
    for (const reviewId of reviewIds) {
      try {
        const review = await DuplicateReviewModel.findById(reviewId)
          .populate('existing_business_id');
        
        if (!review || review.status !== 'pending') {
          results.push({ reviewId, success: false, message: 'Review not found or already processed' });
          continue;
        }
        
        // Process the decision (same logic as single decide)
        if (decision === 'delete') {
          review.status = 'rejected';
          review.decision = 'delete';
          review.reviewed_by = req.user?.sub;
          review.reviewed_at = new Date();
          review.notes = notes;
          await review.save();
          results.push({ reviewId, success: true, message: 'Deleted' });
          
        } else if (decision === 'keep') {
          const newBusiness = await BusinessModel.create({
            business_id: await generateBusinessId(),
            business_name: review.new_business_data.business_name,
            owner_name: review.new_business_data.owner_name,
            address: review.new_business_data.address,
            contact_phone: review.new_business_data.contact_phone,
            contact_email: review.new_business_data.contact_email,
            business_type: review.new_business_data.business_type,
            tax_id: review.new_business_data.tax_id,
            district: review.new_business_data.district,
          });
          
          review.status = 'approved';
          review.decision = 'keep';
          review.reviewed_by = req.user?.sub;
          review.reviewed_at = new Date();
          review.notes = notes;
          await review.save();
          results.push({ reviewId, success: true, message: 'Created', businessId: newBusiness.id });
          
        } else if (decision === 'merge') {
          const existingBusiness = review.existing_business_id;
          const updateData = {};
          
          if (!existingBusiness.owner_name && review.new_business_data.owner_name) {
            updateData.owner_name = review.new_business_data.owner_name;
          }
          if (!existingBusiness.address && review.new_business_data.address) {
            updateData.address = review.new_business_data.address;
          }
          if (!existingBusiness.contact_phone && review.new_business_data.contact_phone) {
            updateData.contact_phone = review.new_business_data.contact_phone;
          }
          
          if (Object.keys(updateData).length > 0) {
            await BusinessModel.updateOne({ _id: existingBusiness._id }, updateData);
          }
          
          review.status = 'merged';
          review.decision = 'merge';
          review.reviewed_by = req.user?.sub;
          review.reviewed_at = new Date();
          review.notes = notes;
          await review.save();
          results.push({ reviewId, success: true, message: 'Merged' });
        }
        
      } catch (err) {
        results.push({ reviewId, success: false, message: err.message });
      }
    }
    
    res.json({ results, total: reviewIds.length, successful: results.filter(r => r.success).length });
  } catch (err) {
    next(err);
  }
});

export const duplicateReviewRoutes = router;

