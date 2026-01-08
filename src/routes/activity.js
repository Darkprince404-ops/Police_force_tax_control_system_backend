import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { getAllUsersActivityToday, getUserActivitySummary, getUserActivityDetails } from '../services/activityService.js';

const router = Router();

// Get all users' activity for today (admin only)
router.get('/today', requireAuth, requireRole(['admin']), async (_req, res, next) => {
  try {
    const activities = await getAllUsersActivityToday();
    res.json(activities);
  } catch (err) {
    next(err);
  }
});

// Get user activity summary
router.get('/users/:userId/summary', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const dateStr = req.query.date;
    const date = dateStr ? new Date(dateStr) : new Date();

    // Users can only view their own activity, unless admin
    if (req.user?.role !== 'admin' && req.user?.sub !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const summary = await getUserActivitySummary(userId, date);
    if (!summary) {
      return res.status(404).json({ message: 'No activity found' });
    }
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Get user activity details
router.get('/users/:userId/details', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    // Users can only view their own activity, unless admin
    if (req.user?.role !== 'admin' && req.user?.sub !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const details = await getUserActivityDetails(userId, startDate, endDate);
    res.json(details);
  } catch (err) {
    next(err);
  }
});

export const activityRoutes = router;

