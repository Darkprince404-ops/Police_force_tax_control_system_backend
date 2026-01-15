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
  geo_method: Joi.string().valid('gps', 'ip', 'none').optional(),
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:64',message:'login-event route hit',data:{path:req.path,method:req.method,hasAuth:!!req.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  console.log('[DEBUG] login-event route hit', { path: req.path, method: req.method, hasAuth: !!req.user, url: req.url });
  // #endregion
  try {
    const { error, value } = loginEventSchema.validate(req.body);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:67',message:'validation result',data:{hasError:!!error,errorMsg:error?.message,bodyKeys:Object.keys(req.body)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (error) throw createError(400, error.message);
    
    const userId = req.user.sub;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:72',message:'calling recordLoginEvent',data:{userId,locationData:value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    await recordLoginEvent(userId, value, req);
    
    res.json({ success: true });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5e1cf7b1-92f8-4f5a-9393-0603b1176d2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:76',message:'login-event error',data:{errorMsg:err.message,errorStack:err.stack,status:err.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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

