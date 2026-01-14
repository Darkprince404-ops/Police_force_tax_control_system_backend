import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { authLimiter } from '../middleware/rateLimit.js';
import { login, refresh } from '../services/authService.js';
import { recordLoginEvent, getLoginEvents } from '../services/loginEventService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  twoFactorCode: Joi.string().length(6).optional(),
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    const result = await login(value.email, value.password, value.twoFactorCode);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { error, value } = refreshSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    const result = await refresh(value.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const loginEventSchema = Joi.object({
  method: Joi.string().valid('gps', 'ip').required(),
  latitude: Joi.number().when('method', {
    is: 'gps',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  longitude: Joi.number().when('method', {
    is: 'gps',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  accuracy: Joi.number().optional(),
});

// Rate limit login events (1 per minute per user)
const loginEventLimiter = authLimiter;

router.post('/login-event', requireAuth, loginEventLimiter, async (req, res, next) => {
  try {
    const { error, value } = loginEventSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    
    const userId = req.user.sub;
    await recordLoginEvent(userId, value, req);
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Admin-only: Get login events
router.get('/login-events', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const userId = req.query.userId || null;
    const events = await getLoginEvents(userId, limit);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

export const authRoutes = router;

