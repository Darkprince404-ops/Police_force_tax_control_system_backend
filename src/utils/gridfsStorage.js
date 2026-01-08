import multer from 'multer';
import { uploadToGridFS } from './gridfs.js';

/**
 * Custom multer storage engine for GridFS
 */
class GridFSStorage {
  constructor(options = {}) {
    this.options = options;
  }

  _handleFile(req, file, cb) {
    const chunks = [];

    file.stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    file.stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const metadata = {
          uploadedBy: req.user?.sub,
          folder: this.options.folder || 'general',
          ...this.options.metadata,
        };

        const result = await uploadToGridFS(
          buffer,
          file.originalname,
          file.mimetype,
          metadata
        );

        cb(null, {
          filename: result.filename,
          path: result.url,
          fileId: result.fileId,
          size: result.size,
          mimetype: file.mimetype,
        });
      } catch (error) {
        cb(error);
      }
    });

    file.stream.on('error', (error) => {
      cb(error);
    });
  }

  _removeFile(req, file, cb) {
    // Files are removed via the deleteFromGridFS function
    cb(null);
  }
}

/**
 * Create multer upload middleware with GridFS storage
 */
export const createGridFSUpload = (options = {}) => {
  const storage = new GridFSStorage(options);

  return multer({
    storage,
    limits: {
      fileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB default
    },
    fileFilter: options.fileFilter || ((req, file, cb) => {
      cb(null, true);
    }),
  });
};

/**
 * Pre-configured upload for general files (imports, evidence)
 */
export const uploadGeneral = createGridFSUpload({
  folder: 'general',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'text/csv',
      'application/zip',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  },
});

/**
 * Pre-configured upload for owner ID images
 */
export const uploadOwnerId = createGridFSUpload({
  folder: 'owner-ids',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
  },
});

/**
 * Pre-configured upload for evidence files
 */
export const uploadEvidence = createGridFSUpload({
  folder: 'evidence',
  maxFileSize: 20 * 1024 * 1024, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'video/mp4',
      'video/quicktime',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type.'));
    }
  },
});

