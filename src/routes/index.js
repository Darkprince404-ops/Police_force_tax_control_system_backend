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
import { paymentRoutes } from './payments.js';

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

// #region agent log
fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.js:49',message:'registering auth routes',data:{hasAuthRoutes:!!authRoutes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion
router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/business-types', businessTypeRoutes);
router.use('/checkins', checkInRoutes);
// #region agent log
fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.js:53',message:'registering case routes',data:{hasCaseRoutes:!!caseRoutes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
// #endregion
router.use('/cases', caseRoutes);
router.use('/cases', evidenceRoutes);
router.use('/imports', importRoutes);
router.use('/duplicate-reviews', duplicateReviewRoutes);
// #region agent log
fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.js:57',message:'registering report routes',data:{hasReportRoutes:!!reportRoutes,reportRoutesType:typeof reportRoutes,reportRoutesKeys:reportRoutes ? Object.keys(reportRoutes) : null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
console.log('[DEBUG] Registering report routes', { hasReportRoutes: !!reportRoutes, type: typeof reportRoutes });
// #endregion
router.use('/reports', reportRoutes);
// #region agent log
console.log('[DEBUG] Report routes registered, checking route stack', { stack: reportRoutes?.stack?.length || 0 });
// #endregion
router.use('/tasks', taskRoutes);
router.use('/users', userRoutes);
router.use('/activity', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit', auditRoutes);
router.use('/edit-requests', editRequestRoutes);
router.use('/files', fileRoutes);
router.use('/payments', paymentRoutes);

export const routes = router;

