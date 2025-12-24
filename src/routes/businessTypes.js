import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { getAllTypes, findSimilarTypes, getOrCreateType } from '../services/businessTypeService.js';

const router = Router();

const createTypeSchema = Joi.object({
  name: Joi.string().required().trim(),
});

// List all business types
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const types = await getAllTypes();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// Search/suggest business types
router.get('/suggest', requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }
    const suggestions = await findSimilarTypes(q);
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

// Create new business type (admin only)
router.post('/', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { error, value } = createTypeSchema.validate(req.body);
    if (error) throw createError(400, error.message);
    
    const businessType = await getOrCreateType(value.name);
    res.status(201).json(businessType);
  } catch (err) {
    next(err);
  }
});

export const businessTypeRoutes = router;

