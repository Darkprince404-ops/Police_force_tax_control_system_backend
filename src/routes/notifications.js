import { Router } from 'express';
import createError from 'http-errors';

import { requireAuth } from '../middleware/auth.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService.js';

const router = Router();

// Get user's notifications
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await getUserNotifications(req.user?.sub, limit);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

// Get unread count
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const { NotificationModel } = await import('../models/notification.js');
    const count = await NotificationModel.countDocuments({
      user_id: req.user?.sub,
      read: false,
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// Mark notification as read
router.put('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const notification = await markNotificationAsRead(req.params.id, req.user?.sub);
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.put('/read-all', requireAuth, async (req, res, next) => {
  try {
    const result = await markAllNotificationsAsRead(req.user?.sub);
    res.json({ message: 'All notifications marked as read', modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

export const notificationRoutes = router;

