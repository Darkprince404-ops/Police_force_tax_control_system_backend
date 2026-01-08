import { Router } from 'express';

import { authRoutes } from './auth.js';
import { businessRoutes } from './businesses.js';
import { businessTypeRoutes } from './businessTypes.js';
import { checkInRoutes } from './checkins.js';
import { caseRoutes } from './cases.js';
import { evidenceRoutes } from './evidence.js';
import { importRoutes } from './imports.js';
import { duplicateReviewRoutes } from './duplicateReviews.js';
import { reportRoutes } from './reports.js';
import { taskRoutes } from './tasks.js';
import { userRoutes } from './users.js';
import { activityRoutes } from './activity.js';
import { notificationRoutes } from './notifications.js';
import { auditRoutes } from './audit.js';
import { editRequestRoutes } from './editRequests.js';
import { fileRoutes } from './files.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasMongoUri: !!process.env.MONGO_URI,
        hasJwtSecret: !!process.env.JWT_SECRET,
      }
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/business-types', businessTypeRoutes);
router.use('/checkins', checkInRoutes);
router.use('/cases', caseRoutes);
router.use('/cases', evidenceRoutes);
router.use('/imports', importRoutes);
router.use('/duplicate-reviews', duplicateReviewRoutes);
router.use('/reports', reportRoutes);
router.use('/tasks', taskRoutes);
router.use('/users', userRoutes);
router.use('/activity', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit', auditRoutes);
router.use('/edit-requests', editRequestRoutes);
router.use('/files', fileRoutes);

export const routes = router;

