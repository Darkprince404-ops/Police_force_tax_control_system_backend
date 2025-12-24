import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { EditRequestModel, BusinessModel, UserModel, NotificationModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';

const router = Router();

const createRequestSchema = Joi.object({
  business_id: Joi.string().required(),
  field_to_edit: Joi.string().valid('fine_amount').required(), // Currently only fine_amount is allowed for users
  requested_value: Joi.alternatives().try(Joi.number().min(0), Joi.string()).required(),
  reason: Joi.string().allow('', null),
});

// Create edit request (users)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { error, value } = createRequestSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    const business = await BusinessModel.findById(value.business_id);
    if (!business) throw createError(404, 'Business not found');

    // Check if user already has a pending request for this business and field
    const existingRequest = await EditRequestModel.findOne({
      business_id: value.business_id,
      requested_by: req.user?.sub,
      field_to_edit: value.field_to_edit,
      status: 'pending',
    });

    if (existingRequest) {
      throw createError(400, 'You already have a pending request for this field');
    }

    // Get current value based on field_to_edit
    let currentValue = null;
    if (value.field_to_edit === 'fine_amount') {
      // Calculate total fine from cases
      const { CaseModel } = await import('../models/index.js');
      const cases = await CaseModel.find({
        'check_in_id.business_id': value.business_id,
      })
        .populate({
          path: 'check_in_id',
          populate: { path: 'business_id' },
        })
        .lean();
      currentValue = cases.reduce((sum, c) => sum + (c.fine_amount || 0), 0);
    } else {
      currentValue = business[value.field_to_edit] || null;
    }

    const editRequest = await EditRequestModel.create({
      ...value,
      requested_by: req.user?.sub,
      current_value: currentValue,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await recordAudit({
      action: 'create',
      entity: 'edit_request',
      entityId: editRequest.id,
      userId: req.user?.sub,
      details: value,
    });

    // Notify admins about new edit request
    const admins = await UserModel.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await NotificationModel.create({
        user_id: admin._id,
        edit_request_id: editRequest.id,
        type: 'edit_request_created',
        title: 'New Edit Request',
        message: `${req.user?.name || 'A user'} requested to edit ${value.field_to_edit} for ${business.business_name}`,
        read: false,
      });
    }

    const populated = await EditRequestModel.findById(editRequest.id)
      .populate('business_id', 'business_name business_id tax_id')
      .populate('requested_by', 'name email');

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

// List requests (role-filtered: users see own, admins see all)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { business_id, status } = req.query;
    const filter = {};

    // Regular users can only see their own requests
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      filter.requested_by = req.user?.sub;
    }

    if (business_id) filter.business_id = business_id;
    if (status) filter.status = status;

    const requests = await EditRequestModel.find(filter)
      .populate('business_id', 'business_name business_id tax_id')
      .populate('requested_by', 'name email')
      .populate('reviewed_by', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// Get pending requests (admin only)
router.get('/pending', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const requests = await EditRequestModel.find({ status: 'pending' })
      .populate('business_id', 'business_name business_id tax_id owner_name')
      .populate('requested_by', 'name email role')
      .sort({ createdAt: 1 }) // Oldest first
      .limit(50);

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// Get requests for a specific business
router.get('/business/:businessId', requireAuth, async (req, res, next) => {
  try {
    const filter = { business_id: req.params.businessId };

    // Regular users can only see their own requests
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      filter.requested_by = req.user?.sub;
    }

    const requests = await EditRequestModel.find(filter)
      .populate('business_id', 'business_name business_id tax_id')
      .populate('requested_by', 'name email')
      .populate('reviewed_by', 'name email')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// Approve request (admin only)
router.put('/:id/approve', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { reviewed_notes } = req.body;
    const editRequest = await EditRequestModel.findById(req.params.id)
      .populate('business_id')
      .populate('requested_by');

    if (!editRequest) throw createError(404, 'Edit request not found');
    if (editRequest.status !== 'pending') {
      throw createError(400, `Request is already ${editRequest.status}`);
    }

    // Check if expired
    if (editRequest.expires_at && new Date() > editRequest.expires_at) {
      editRequest.status = 'expired';
      await editRequest.save();
      throw createError(400, 'Request has expired');
    }

    editRequest.status = 'approved';
    editRequest.reviewed_by = req.user?.sub;
    editRequest.reviewed_at = new Date();
    editRequest.reviewed_notes = reviewed_notes || null;

    await editRequest.save();

    await recordAudit({
      action: 'approve',
      entity: 'edit_request',
      entityId: editRequest.id,
      userId: req.user?.sub,
      details: { reviewed_notes },
    });

    // Notify the requester that their request was approved
    await NotificationModel.create({
      user_id: editRequest.requested_by._id,
      edit_request_id: editRequest.id,
      type: 'edit_request_approved',
      title: 'Edit Request Approved',
      message: `Your request to edit ${editRequest.field_to_edit} for ${editRequest.business_id.business_name} has been approved. You can now make the edit.`,
      read: false,
    });

    const populated = await EditRequestModel.findById(editRequest.id)
      .populate('business_id', 'business_name business_id tax_id')
      .populate('requested_by', 'name email')
      .populate('reviewed_by', 'name email');

    res.json(populated);
  } catch (err) {
    next(err);
  }
});

// Reject request (admin only)
router.put('/:id/reject', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { reviewed_notes } = req.body;
    const editRequest = await EditRequestModel.findById(req.params.id)
      .populate('business_id')
      .populate('requested_by');

    if (!editRequest) throw createError(404, 'Edit request not found');
    if (editRequest.status !== 'pending') {
      throw createError(400, `Request is already ${editRequest.status}`);
    }

    editRequest.status = 'rejected';
    editRequest.reviewed_by = req.user?.sub;
    editRequest.reviewed_at = new Date();
    editRequest.reviewed_notes = reviewed_notes || null;

    await editRequest.save();

    await recordAudit({
      action: 'reject',
      entity: 'edit_request',
      entityId: editRequest.id,
      userId: req.user?.sub,
      details: { reviewed_notes },
    });

    // Notify the requester that their request was rejected
    await NotificationModel.create({
      user_id: editRequest.requested_by._id,
      edit_request_id: editRequest.id,
      type: 'edit_request_rejected',
      title: 'Edit Request Rejected',
      message: `Your request to edit ${editRequest.field_to_edit} for ${editRequest.business_id.business_name} has been rejected.${reviewedNotes ? ` Reason: ${reviewedNotes}` : ''}`,
      read: false,
    });

    const populated = await EditRequestModel.findById(editRequest.id)
      .populate('business_id', 'business_name business_id tax_id')
      .populate('requested_by', 'name email')
      .populate('reviewed_by', 'name email');

    res.json(populated);
  } catch (err) {
    next(err);
  }
});

export const editRequestRoutes = router;

