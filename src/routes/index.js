import { Router } from 'express';

import { authRoutes } from './auth.js';
import { businessRoutes } from './businesses.js';
import { businessTypeRoutes } from './businessTypes.js';
import { checkInRoutes } from './checkins.js';
import { caseRoutes } from './cases.js';
import { evidenceRoutes } from './evidence.js';
import { importRoutes } from './imports.js';
import { reportRoutes } from './reports.js';
import { taskRoutes } from './tasks.js';
import { userRoutes } from './users.js';
import { activityRoutes } from './activity.js';
import { notificationRoutes } from './notifications.js';
import { auditRoutes } from './audit.js';
import { editRequestRoutes } from './editRequests.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/business-types', businessTypeRoutes);
router.use('/checkins', checkInRoutes);
router.use('/cases', caseRoutes);
router.use('/cases', evidenceRoutes);
router.use('/imports', importRoutes);
router.use('/reports', reportRoutes);
router.use('/tasks', taskRoutes);
router.use('/users', userRoutes);
router.use('/activity', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit', auditRoutes);
router.use('/edit-requests', editRequestRoutes);

export const routes = router;

