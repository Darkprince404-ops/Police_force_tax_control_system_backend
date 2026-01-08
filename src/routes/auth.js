import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { authLimiter } from '../middleware/rateLimit.js';
import { login, refresh } from '../services/authService.js';

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

export const authRoutes = router;

