import fs from 'fs';
import path from 'path';
import os from 'os';

import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { ImportJobModel } from '../models/importJob.js';
import { recordAudit } from '../services/auditService.js';
import { parsePreview, processImport } from '../services/importService.js';
import { uploadGeneral } from '../utils/gridfsStorage.js';
import { downloadFromGridFS } from '../utils/gridfs.js';

const router = Router();

/**
 * Download file from GridFS to a temporary file for processing
 */
const downloadToTempFile = async (fileId, originalFilename) => {
  const { stream, file } = await downloadFromGridFS(fileId);
  
  const ext = originalFilename ? path.extname(originalFilename) : '.xlsx';
  const tempFilePath = path.join(os.tmpdir(), `import-${fileId}-${Date.now()}${ext}`);
  
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempFilePath);
    stream.pipe(writeStream);
    
    writeStream.on('finish', () => {
      resolve(tempFilePath);
    });
    
    writeStream.on('error', (error) => {
      reject(error);
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Clean up temporary file
 */
const cleanupTempFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[Cleanup] Removed temp file:', filePath);
    }
  } catch (err) {
    console.error('[Cleanup] Failed to remove temp file:', err);
  }
};

router.post(
  '/upload',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  uploadGeneral.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw createError(400, 'File required');
      
      console.log('[Upload] File uploaded to GridFS:', {
        originalname: req.file.originalname,
        filename: req.file.filename,
        fileId: req.file.fileId,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
      
      const job = await ImportJobModel.create({
        filename: req.file.fileId, // Store GridFS file ID
        fileUrl: req.file.path,    // Store the URL path to access the file
        originalFilename: req.file.originalname,
        storageType: 'gridfs',
        uploadedBy: req.user?.sub,
        status: 'pending',
      });
      
      console.log('[Upload] Import job created:', job.id, 'FileId:', req.file.fileId);
      
      res.status(201).json({ 
        importId: job.id, 
        filename: req.file.originalname,
        storageType: 'gridfs',
      });
    } catch (err) {
      console.error('[Upload] Error:', err);
      next(err);
    }
  },
);

const previewSchema = Joi.object({
  importId: Joi.string().required(),
});

router.post('/preview', requireAuth, async (req, res, next) => {
  let tempFilePath = null;
  
  try {
    const { error, value } = previewSchema.validate(req.body);
    if (error) {
      console.error('[Preview] Validation error:', error.message);
      return next(createError(400, error.message));
    }
    
    const job = await ImportJobModel.findById(value.importId);
    if (!job) {
      console.error('[Preview] Import job not found:', value.importId);
      return next(createError(404, 'Import not found'));
    }
    
    if (!job.filename) {
      console.error('[Preview] No filename in import job:', job.id);
      return next(createError(400, 'File not found for this import'));
    }
    
    console.log('[Preview] Request - Import ID:', value.importId);
    console.log('[Preview] Storage type:', job.storageType || 'gridfs');
    console.log('[Preview] File ID:', job.filename);
    
    // Download from GridFS to temp file
    console.log('[Preview] Downloading from GridFS...');
    tempFilePath = await downloadToTempFile(job.filename, job.originalFilename);
    console.log('[Preview] Downloaded to:', tempFilePath);
    
    let preview;
    try {
      preview = parsePreview(tempFilePath);
      console.log('[Preview] Generated successfully - Rows:', preview.totalRows);
    } catch (parseError) {
      console.error('[Preview] Parse error:', parseError);
      console.error('[Preview] Parse error stack:', parseError.stack);
      
      // Return user-friendly error message
      const errorMessage = parseError.message || 'Failed to parse file';
      return next(createError(400, errorMessage));
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        cleanupTempFile(tempFilePath);
      }
    }
    
    res.json({ importId: job.id, ...preview });
  } catch (err) {
    console.error('[Preview] Error:', err);
    console.error('[Preview] Error details:', {
      message: err.message,
      stack: err.stack,
      importId: req.body?.importId,
      status: err.status || err.statusCode,
    });
    
    // Clean up temp file on error
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
    
    // If it's already an HTTP error, pass it through
    if (err.status || err.statusCode) {
      return next(err);
    }
    
    // Otherwise, wrap it as a 500 error
    return next(createError(500, err.message || 'Internal server error'));
  }
});

const processSchema = Joi.object({
  importId: Joi.string().required(),
  mapping: Joi.object().required(),
  duplicatePolicy: Joi.string().valid('skip', 'update', 'create', 'review').required(),
});

router.post(
  '/process',
  requireAuth,
  requireRole(['officer', 'supervisor', 'admin']),
  async (req, res, next) => {
    try {
      console.log('[Import Process] Starting import process');
      console.log('[Import Process] Request body:', JSON.stringify(req.body, null, 2));
      
      const { error, value } = processSchema.validate(req.body);
      if (error) {
        console.error('[Import Process] Validation error:', error.message);
        throw createError(400, error.message);
      }
      
      const job = await ImportJobModel.findById(value.importId);
      if (!job) {
        console.error('[Import Process] Job not found:', value.importId);
        throw createError(404, 'Import not found');
      }
      
      console.log('[Import Process] Job found:', job.id, 'Storage:', job.storageType || 'gridfs');
      console.log('[Import Process] File ID:', job.filename);
      
      // Check if already processing
      if (job.status === 'processing') {
        return res.json({ 
          importId: job.id, 
          status: 'processing',
          message: 'Import is already being processed',
          progress: {
            totalRows: job.totalRows,
            processedRows: job.processedRows,
            progressPercent: job.progressPercent,
            currentBatch: job.currentBatch,
            totalBatches: job.totalBatches,
          }
        });
      }
      
      job.status = 'processing';
      job.mapping = value.mapping;
      job.processedRows = 0;
      job.progressPercent = 0;
      await job.save();

      // Return immediately and process in background
      res.json({ 
        importId: job.id, 
        status: 'processing',
        message: 'Import started. Poll /imports/:id/progress for status.'
      });

      // Process in background (don't await)
      console.log('[Import Process] Starting background processing...');
      
      // Async background processing
      (async () => {
        let tempFilePath = null;
        try {
          // Download from GridFS to temp file
          console.log('[Import Process] Downloading from GridFS...');
          tempFilePath = await downloadToTempFile(job.filename, job.originalFilename);
          console.log('[Import Process] Downloaded to:', tempFilePath);
          
          const result = await processImport(tempFilePath, value.mapping, { duplicatePolicy: value.duplicatePolicy }, req.user.sub, job.id);
          
          console.log('[Import Process] Background processing completed successfully');
          job.status = 'completed';
          job.summary = result.summary;
          job.rows = result.rowLogs.slice(0, 1000); // Limit stored rows to prevent huge documents
          job.progressPercent = 100;
          await job.save();

          await recordAudit({
            action: 'update',
            entity: 'import',
            entityId: job.id,
            userId: req.user?.sub,
            details: { summary: result.summary },
          });
          
          console.log('[Import Process] Job completed:', job.id, 'Summary:', JSON.stringify(result.summary));
        } catch (err) {
          console.error('[Import Process] Background processing FAILED:', err);
          console.error('[Import Process] Error stack:', err.stack);
          job.status = 'failed';
          job.errorMessage = err.message;
          await job.save();
        } finally {
          // Clean up temp file
          if (tempFilePath) {
            cleanupTempFile(tempFilePath);
          }
        }
      })();

    } catch (err) {
      next(err);
    }
  },
);

// Progress endpoint for polling
router.get('/:id/progress', requireAuth, async (req, res, next) => {
  try {
    const job = await ImportJobModel.findById(req.params.id);
    if (!job) throw createError(404, 'Import not found');
    
    res.json({
      importId: job.id,
      status: job.status,
      totalRows: job.totalRows || 0,
      processedRows: job.processedRows || 0,
      progressPercent: job.progressPercent || 0,
      currentBatch: job.currentBatch || 0,
      totalBatches: job.totalBatches || 0,
      summary: job.summary,
      errorMessage: job.errorMessage,
    });
  } catch (err) {
    next(err);
  }
});

const retrySchema = Joi.object({
  importId: Joi.string().required(),
});

// Reprocess previously failed rows (best-effort: re-run full file with same mapping/policy)
router.post(
  '/reprocess',
  requireAuth,
  requireRole(['supervisor', 'admin']),
  async (req, res, next) => {
    let tempFilePath = null;
    try {
      const { error, value } = retrySchema.validate(req.body);
      if (error) throw createError(400, error.message);
      const job = await ImportJobModel.findById(value.importId);
      if (!job) throw createError(404, 'Import not found');
      if (!job.mapping) throw createError(400, 'No mapping stored to reprocess');
      job.status = 'processing';
      await job.save();

      // Download from GridFS to temp file
      tempFilePath = await downloadToTempFile(job.filename, job.originalFilename);
      
      const result = await processImport(tempFilePath, job.mapping, { duplicatePolicy: 'update' }, req.user.sub);

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
    } finally {
      if (tempFilePath) {
        cleanupTempFile(tempFilePath);
      }
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
