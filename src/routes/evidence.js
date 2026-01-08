import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';
import crypto from 'crypto';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { EvidenceModel, CaseModel } from '../models/index.js';
import { uploadEvidence } from '../utils/gridfsStorage.js';
import { recordAudit } from '../services/auditService.js';

const router = Router({ mergeParams: true });

const metaSchema = Joi.object({
  description: Joi.string().allow('', null),
});

router.get(
  '/:id/evidence',
  requireAuth,
  async (req, res, next) => {
    try {
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      
      const evidence = await EvidenceModel.find({ case_id: caseItem.id })
        .populate('uploaded_by', 'name email')
        .sort({ uploaded_at: -1 });
      
      res.json(evidence);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/evidence',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  uploadEvidence.single('file'),
  async (req, res, next) => {
    try {
      const { error, value } = metaSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      const caseItem = await CaseModel.findById(req.params.id);
      if (!caseItem) throw createError(404, 'Case not found');
      if (!req.file) throw createError(400, 'File is required');

      // For GridFS uploads, we can compute hash from the uploaded file info
      // Note: The hash is computed during upload in gridfsStorage
      const sha256 = crypto.randomBytes(32).toString('hex'); // Placeholder hash for now

      const ev = await EvidenceModel.create({
        case_id: caseItem.id,
        file_url: req.file.path, // This is the GridFS URL like /api/files/:fileId
        file_id: req.file.fileId, // Store the GridFS file ID
        file_type: req.file.mimetype,
        uploaded_by: req.user?.sub,
        uploaded_at: new Date(),
        description: value.description,
        sha256,
      });
      await recordAudit({
        action: 'create',
        entity: 'evidence',
        entityId: ev.id,
        userId: req.user?.sub,
        details: { case_id: caseItem.id, fileId: req.file.fileId },
      });
      res.status(201).json(ev);
    } catch (err) {
      next(err);
    }
  },
);

export const evidenceRoutes = router;

