import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import crypto from 'crypto';

let bucket = null;

/**
 * Initialize GridFS bucket
 */
export const initGridFS = () => {
  if (!bucket && mongoose.connection.db) {
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads',
    });
    console.log('✅ GridFS bucket initialized');
  }
  return bucket;
};

/**
 * Get or initialize GridFS bucket
 */
export const getGridFSBucket = () => {
  if (!bucket) {
    return initGridFS();
  }
  return bucket;
};

/**
 * Upload a file to GridFS
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Upload result with file ID and URL
 */
export const uploadToGridFS = async (fileBuffer, filename, contentType, metadata = {}) => {
  const gridBucket = getGridFSBucket();
  if (!gridBucket) {
    throw new Error('GridFS not initialized');
  }

  const uniqueFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${filename}`;
  
  return new Promise((resolve, reject) => {
    const readableStream = Readable.from(fileBuffer);
    const uploadStream = gridBucket.openUploadStream(uniqueFilename, {
      contentType,
      metadata: {
        ...metadata,
        originalName: filename,
        uploadedAt: new Date(),
      },
    });

    readableStream.pipe(uploadStream);

    uploadStream.on('finish', () => {
      const fileId = uploadStream.id.toString();
      resolve({
        fileId,
        filename: uniqueFilename,
        url: `/api/files/${fileId}`,
        contentType,
        size: fileBuffer.length,
      });
    });

    uploadStream.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Download a file from GridFS
 * @param {string} fileId - The GridFS file ID
 * @returns {Promise<{stream: ReadableStream, file: Object}>}
 */
export const downloadFromGridFS = async (fileId) => {
  const gridBucket = getGridFSBucket();
  if (!gridBucket) {
    throw new Error('GridFS not initialized');
  }

  const objectId = new mongoose.Types.ObjectId(fileId);
  
  // Get file info
  const files = await gridBucket.find({ _id: objectId }).toArray();
  if (files.length === 0) {
    throw new Error('File not found');
  }

  const file = files[0];
  const downloadStream = gridBucket.openDownloadStream(objectId);

  return { stream: downloadStream, file };
};

/**
 * Delete a file from GridFS
 * @param {string} fileId - The GridFS file ID
 */
export const deleteFromGridFS = async (fileId) => {
  const gridBucket = getGridFSBucket();
  if (!gridBucket) {
    throw new Error('GridFS not initialized');
  }

  try {
    const objectId = new mongoose.Types.ObjectId(fileId);
    await gridBucket.delete(objectId);
    return true;
  } catch (error) {
    console.error('Error deleting file from GridFS:', error);
    return false;
  }
};

/**
 * Get file info from GridFS
 * @param {string} fileId - The GridFS file ID
 * @returns {Promise<Object|null>}
 */
export const getFileInfo = async (fileId) => {
  const gridBucket = getGridFSBucket();
  if (!gridBucket) {
    throw new Error('GridFS not initialized');
  }

  try {
    const objectId = new mongoose.Types.ObjectId(fileId);
    const files = await gridBucket.find({ _id: objectId }).toArray();
    return files.length > 0 ? files[0] : null;
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
};

