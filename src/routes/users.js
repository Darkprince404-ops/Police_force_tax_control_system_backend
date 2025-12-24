import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';
import bcrypt from 'bcryptjs';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { UserModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';
import { Roles } from '../constants/enums.js';

const router = Router();

const strongPassword = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).+$/)
  .message('Password must be 8+ chars with upper, lower, number, and symbol');

const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().required().trim(),
  password: strongPassword.required(),
  role: Joi.string().valid(...Roles).required(),
});

const updateUserSchema = Joi.object({
  email: Joi.string().email(),
  name: Joi.string().trim(),
  password: strongPassword,
  role: Joi.string().valid(...Roles),
});

// List all users (admin only)
router.get('/', requireAuth, requireRole(['admin']), async (_req, res, next) => {
  try {
    const users = await UserModel.find({}).select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// Get single user (admin only, or own profile)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-passwordHash');
    if (!user) throw createError(404, 'User not found');

    // Users can view their own profile, admins can view any
    if (req.user?.role !== 'admin' && req.user?.sub !== req.params.id) {
      throw createError(403, 'Access denied');
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Create new user (admin only)
router.post('/', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    // Check if email already exists
    const existing = await UserModel.findOne({ email: value.email.toLowerCase() });
    if (existing) throw createError(400, 'Email already exists');

    const passwordHash = await bcrypt.hash(value.password, 10);

    const user = await UserModel.create({
      email: value.email.toLowerCase(),
      name: value.name,
      passwordHash,
      role: value.role,
    });

    await recordAudit({
      action: 'create',
      entity: 'user',
      entityId: user.id,
      userId: req.user?.sub,
      details: { email: user.email, name: user.name, role: user.role },
    });

    const userResponse = await UserModel.findById(user.id).select('-passwordHash');
    res.status(201).json(userResponse);
  } catch (err) {
    next(err);
  }
});

// Update user (admin only, or own profile for limited fields)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) throw createError(404, 'User not found');

    const isAdmin = req.user?.role === 'admin';
    const isOwnProfile = req.user?.sub === req.params.id;

    // Users can only update their own profile (limited fields), admins can update any
    if (!isAdmin && !isOwnProfile) {
      throw createError(403, 'Access denied');
    }

    const { error, value } = updateUserSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    // Non-admins can't change role
    if (value.role && !isAdmin) {
      delete value.role;
    }

    // Check email uniqueness if changing email
    if (value.email && value.email.toLowerCase() !== user.email) {
      const existing = await UserModel.findOne({ email: value.email.toLowerCase() });
      if (existing) throw createError(400, 'Email already exists');
      value.email = value.email.toLowerCase();
    }

    // Hash password if updating
    if (value.password) {
      value.passwordHash = await bcrypt.hash(value.password, 10);
      delete value.password;
    }

    Object.assign(user, value);
    await user.save();

    await recordAudit({
      action: 'update',
      entity: 'user',
      entityId: user.id,
      userId: req.user?.sub,
      details: value,
    });

    const userResponse = await UserModel.findById(user.id).select('-passwordHash');
    res.json(userResponse);
  } catch (err) {
    next(err);
  }
});

// Deactivate user (admin only) - soft delete by setting a flag or actually deleting
router.delete('/:id', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) throw createError(404, 'User not found');

    // Prevent deleting yourself
    if (req.user?.sub === req.params.id) {
      throw createError(400, 'Cannot delete your own account');
    }

    await UserModel.findByIdAndDelete(req.params.id);

    await recordAudit({
      action: 'delete',
      entity: 'user',
      entityId: req.params.id,
      userId: req.user?.sub,
      details: { email: user.email, name: user.name },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export const userRoutes = router;

