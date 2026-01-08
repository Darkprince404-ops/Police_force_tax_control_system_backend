import { Router } from 'express';
import createError from 'http-errors';
import { downloadFromGridFS, getFileInfo } from '../utils/gridfs.js';

const router = Router();

/**
 * GET /api/files/:fileId
 * Serve a file from GridFS
 */
router.get('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;

    if (!fileId || fileId.length !== 24) {
      throw createError(400, 'Invalid file ID');
    }

    const { stream, file } = await downloadFromGridFS(fileId);

    // Set appropriate headers
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Length', file.length);
    
    // Set content disposition for downloads
    const originalName = file.metadata?.originalName || file.filename;
    res.set('Content-Disposition', `inline; filename="${originalName}"`);
    
    // Cache for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');

    // Pipe the file stream to response
    stream.pipe(res);

    stream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        next(createError(500, 'Error streaming file'));
      }
    });
  } catch (error) {
    if (error.message === 'File not found') {
      next(createError(404, 'File not found'));
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/files/:fileId/info
 * Get file metadata
 */
router.get('/:fileId/info', async (req, res, next) => {
  try {
    const { fileId } = req.params;

    if (!fileId || fileId.length !== 24) {
      throw createError(400, 'Invalid file ID');
    }

    const fileInfo = await getFileInfo(fileId);
    if (!fileInfo) {
      throw createError(404, 'File not found');
    }

    res.json({
      id: fileInfo._id,
      filename: fileInfo.filename,
      contentType: fileInfo.contentType,
      size: fileInfo.length,
      uploadDate: fileInfo.uploadDate,
      metadata: fileInfo.metadata,
    });
  } catch (error) {
    next(error);
  }
});

export const fileRoutes = router;

