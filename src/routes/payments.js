import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { PaymentModel, CaseModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';
import { uploadGeneral } from '../utils/gridfsStorage.js';

const router = Router();

// Get pending payments for finance verification
router.get('/pending', requireAuth, requireRole(['finance', 'admin']), async (req, res, next) => {
  try {
    const payments = await PaymentModel.find({ status: 'pending_verification' })
      .populate({
        path: 'case_id',
        select: 'case_number case_type fine_amount business_name',
        populate: {
          path: 'check_in_id',
          select: 'business_id',
          populate: {
            path: 'business_id',
            select: 'business_name business_id tax_id owner_name',
          },
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// Get payment by case ID
router.get('/case/:caseId', requireAuth, async (req, res, next) => {
  try {
    const payment = await PaymentModel.findOne({ case_id: req.params.caseId })
      .populate('verified_by', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    if (!payment) {
      return res.json(null);
    }

    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// Upload payment receipt (creates payment record)
const uploadPaymentSchema = Joi.object({
  case_id: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  payment_date: Joi.date().required(),
  payment_method: Joi.string().valid('cash', 'bank_transfer', 'mobile_money', 'other').optional(),
  receipt_reference: Joi.string().required(),
  notes: Joi.string().allow('', null).optional(),
});

router.post(
  '/upload',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin', 'finance']),
  uploadGeneral.single('receipt'),
  async (req, res, next) => {
    try {
      const { error, value } = uploadPaymentSchema.validate(req.body);
      if (error) throw createError(400, error.message);

      // Verify case exists and has a fine
      const caseItem = await CaseModel.findById(value.case_id);
      if (!caseItem) throw createError(404, 'Case not found');

      if (caseItem.fine_amount === 0 || !caseItem.fine_amount) {
        throw createError(400, 'Case has no fine amount');
      }

      // Check if payment already exists
      const existingPayment = await PaymentModel.findOne({ case_id: value.case_id });
      if (existingPayment && existingPayment.status === 'verified') {
        throw createError(400, 'Payment already verified for this case');
      }

      // Create or update payment record
      const paymentData = {
        case_id: value.case_id,
        amount: value.amount,
        payment_date: new Date(value.payment_date),
        payment_method: value.payment_method || 'cash',
        receipt_reference: value.receipt_reference,
        receipt_file_id: req.file?.fileId || null,
        notes: value.notes,
        status: 'pending_verification',
      };

      let payment;
      if (existingPayment) {
        // Update existing payment
        payment = await PaymentModel.findByIdAndUpdate(existingPayment._id, paymentData, { new: true });
      } else {
        // Create new payment
        payment = await PaymentModel.create(paymentData);
      }

      // Update case payment status
      caseItem.payment_status = 'pending_verification';
      await caseItem.save();

      await recordAudit({
        action: existingPayment ? 'update' : 'create',
        entity: 'payment',
        entityId: payment.id,
        userId: req.user?.sub,
        details: { case_id: value.case_id, amount: value.amount },
      });

      res.status(201).json(payment);
    } catch (err) {
      next(err);
    }
  },
);

// Verify payment (finance only)
const verifyPaymentSchema = Joi.object({
  notes: Joi.string().allow('', null).optional(),
});

router.post('/:id/verify', requireAuth, requireRole(['finance', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = verifyPaymentSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) throw createError(404, 'Payment not found');

    if (payment.status !== 'pending_verification') {
      throw createError(400, 'Payment is not pending verification');
    }

    const caseItem = await CaseModel.findById(payment.case_id);
    if (!caseItem) throw createError(404, 'Case not found');

    // Verify payment amount matches or exceeds fine
    if (payment.amount < caseItem.fine_amount) {
      throw createError(400, `Payment amount ($${payment.amount}) is less than fine amount ($${caseItem.fine_amount})`);
    }

    // Update payment
    payment.status = 'verified';
    payment.verified_by = req.user?.sub;
    payment.verified_at = new Date();
    if (value.notes) {
      payment.notes = (payment.notes || '') + '\n\nVerification: ' + value.notes;
    }
    await payment.save();

    // Update case
    caseItem.payment_status = 'paid';
    caseItem.payment_amount = payment.amount;
    caseItem.payment_date = payment.verified_at;
    await caseItem.save();

    await recordAudit({
      action: 'verify',
      entity: 'payment',
      entityId: payment.id,
      userId: req.user?.sub,
      details: { case_id: caseItem.id, amount: payment.amount },
    });

    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// Reject payment (finance only)
const rejectPaymentSchema = Joi.object({
  reason: Joi.string().required(),
});

router.post('/:id/reject', requireAuth, requireRole(['finance', 'admin']), async (req, res, next) => {
  try {
    const { error, value } = rejectPaymentSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) throw createError(404, 'Payment not found');

    if (payment.status !== 'pending_verification') {
      throw createError(400, 'Payment is not pending verification');
    }

    const caseItem = await CaseModel.findById(payment.case_id);
    if (!caseItem) throw createError(404, 'Case not found');

    // Reject payment
    payment.status = 'rejected';
    payment.verified_by = req.user?.sub;
    payment.verified_at = new Date();
    payment.notes = (payment.notes || '') + '\n\nRejected: ' + value.reason;
    await payment.save();

    // Reset case payment status
    caseItem.payment_status = 'unpaid';
    await caseItem.save();

    await recordAudit({
      action: 'reject',
      entity: 'payment',
      entityId: payment.id,
      userId: req.user?.sub,
      details: { case_id: caseItem.id, reason: value.reason },
    });

    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// Get payment statistics
router.get('/stats', requireAuth, requireRole(['finance', 'admin']), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.verified_at = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.verified_at.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.verified_at.$lte = end;
      }
    }

    const totalVerified = await PaymentModel.countDocuments({
      ...filter,
      status: 'verified',
    });

    const totalPending = await PaymentModel.countDocuments({
      status: 'pending_verification',
    });

    const totalAmount = await PaymentModel.aggregate([
      { $match: { ...filter, status: 'verified' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalCollected = totalAmount[0]?.total || 0;

    res.json({
      total_verified: totalVerified,
      total_pending: totalPending,
      total_collected: totalCollected,
    });
  } catch (err) {
    next(err);
  }
});

export const paymentRoutes = router;
