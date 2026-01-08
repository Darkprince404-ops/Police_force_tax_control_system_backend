import { Router } from 'express';
import createError from 'http-errors';
import { requireAuth } from '../middleware/auth.js';
import { AuditLogModel } from '../models/index.js';

const router = Router();

// Get audit timeline for an entity
router.get('/:entity/:entityId', requireAuth, async (req, res, next) => {
  try {
    const { entity, entityId } = req.params;
    if (!entity || !entityId) throw createError(400, 'Entity and ID are required');
    const logs = await AuditLogModel.find({ entity, entityId })
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export const auditRoutes = router;

