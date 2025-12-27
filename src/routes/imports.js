import fs from 'fs';

import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { ImportJobModel } from '../models/importJob.js';
import { recordAudit } from '../services/auditService.js';
import { parsePreview, processImport } from '../services/importService.js';
import { upload } from '../utils/storage.js';

const router = Router();

router.post(
  '/upload',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw createError(400, 'File required');
      
      console.log('File uploaded:', {
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
      
      const job = await ImportJobModel.create({
        filename: req.file.path,
        uploadedBy: req.user?.sub,
        status: 'pending',
      });
      
      console.log('Import job created:', job.id);
      
      res.status(201).json({ importId: job.id, filename: req.file.originalname });
    } catch (err) {
      console.error('Upload error:', err);
      next(err);
    }
  },
);

const previewSchema = Joi.object({
  importId: Joi.string().required(),
});

router.post('/preview', requireAuth, async (req, res, next) => {
  try {
    const { error, value } = previewSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    
    const job = await ImportJobModel.findById(value.importId);
    if (!job) throw createError(404, 'Import not found');
    
    if (!job.filename) {
      throw createError(400, 'File not found for this import');
    }
    
    console.log('Preview request - Import ID:', value.importId);
    console.log('File path:', job.filename);
    
    const preview = parsePreview(job.filename);
    console.log('Preview generated successfully - Rows:', preview.totalRows);
    
    res.json({ importId: job.id, ...preview });
  } catch (err) {
    console.error('Preview error:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      importId: req.body?.importId,
    });
    next(err);
  }
});

const processSchema = Joi.object({
  importId: Joi.string().required(),
  mapping: Joi.object().required(),
  duplicatePolicy: Joi.string().valid('skip', 'update', 'create').required(),
});

router.post(
  '/process',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = processSchema.validate(req.body);
      if (error) throw createError(400, error.message);
      const job = await ImportJobModel.findById(value.importId);
      if (!job) throw createError(404, 'Import not found');
      job.status = 'processing';
      await job.save();

      const result = await processImport(job.filename, value.mapping, { duplicatePolicy: value.duplicatePolicy }, req.user.sub);

      job.status = 'completed';
      job.summary = result.summary;
      job.rows = result.rowLogs;
      await job.save();

      await recordAudit({
        action: 'update',
        entity: 'import',
        entityId: job.id,
        userId: req.user?.sub,
        details: { summary: result.summary },
      });

      res.json({ importId: job.id, summary: result.summary });
    } catch (err) {
      next(err);
    }
  },
);

const retrySchema = Joi.object({
  importId: Joi.string().required(),
});

// Reprocess previously failed rows (best-effort: re-run full file with same mapping/policy)
router.post(
  '/reprocess',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    try {
      const { error, value } = retrySchema.validate(req.body);
      if (error) throw createError(400, error.message);
      const job = await ImportJobModel.findById(value.importId);
      if (!job) throw createError(404, 'Import not found');
      if (!job.mapping) throw createError(400, 'No mapping stored to reprocess');
      job.status = 'processing';
      await job.save();

      const result = await processImport(job.filename, job.mapping, { duplicatePolicy: 'update' }, req.user.sub);

      job.status = 'completed';
      job.summary = result.summary;
      job.rows = result.rowLogs;
      await job.save();

      await recordAudit({
        action: 'update',
        entity: 'import',
        entityId: job.id,
        userId: req.user?.sub,
        details: { summary: result.summary, reprocess: true },
      });

      res.json({ importId: job.id, summary: result.summary });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id/report', requireAuth, async (req, res, next) => {
  try {
    const job = await ImportJobModel.findById(req.params.id);
    if (!job) throw createError(404, 'Import not found');
    res.json(job);
  } catch (err) {
    next(err);
  }
});

export const importRoutes = router;

