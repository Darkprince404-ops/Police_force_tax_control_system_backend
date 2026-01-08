import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';
import bcrypt from 'bcryptjs';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { UserModel } from '../models/index.js';
import { CaseModel } from '../models/case.js';
import { CheckInModel } from '../models/checkIn.js';
import { recordAudit } from '../services/auditService.js';
import { Roles } from '../constants/enums.js';

const router = Router();

const UserStatus = ['active', 'inactive', 'suspended'];

// Simple password validation - minimum 4 characters
const simplePassword = Joi.string()
  .min(4)
  .message('Password must be at least 4 characters');

const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().required().trim(),
  password: simplePassword.required(),
  role: Joi.string().valid(...Roles).required(),
  status: Joi.string().valid(...UserStatus).default('active'),
  supervisor_id: Joi.string().hex().length(24).allow(null, ''),
});

const updateUserSchema = Joi.object({
  email: Joi.string().email(),
  name: Joi.string().trim(),
  password: simplePassword,
  role: Joi.string().valid(...Roles),
  status: Joi.string().valid(...UserStatus),
  supervisor_id: Joi.string().hex().length(24).allow(null, ''),
});

// List all users with search, filter, pagination (admin only)
router.get('/', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { search, role, status, supervisor_id, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Filter by role
    if (role && Roles.includes(role)) {
      query.role = role;
    }
    
    // Filter by status
    if (status && UserStatus.includes(status)) {
      query.status = status;
    }
    
    // Filter by supervisor
    if (supervisor_id) {
      query.supervisor_id = supervisor_id;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [users, total] = await Promise.all([
      UserModel.find(query)
        .select('-passwordHash')
        .populate('supervisor_id', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserModel.countDocuments(query),
    ]);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get supervisors list (for dropdown)
router.get('/supervisors', requireAuth, requireRole(['admin']), async (_req, res, next) => {
  try {
    const supervisors = await UserModel.find({ 
      role: { $in: ['supervisor', 'admin'] },
      status: 'active',
    })
      .select('_id name email role')
      .sort({ name: 1 });
    res.json(supervisors);
  } catch (err) {
    next(err);
  }
});

// Get my officers (supervisor only)
router.get('/my-officers', requireAuth, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const officers = await UserModel.find({ supervisor_id: req.user.sub })
      .select('-passwordHash')
      .sort({ name: 1 });
    
    // Get case counts for each officer
    const officersWithStats = await Promise.all(
      officers.map(async (officer) => {
        const [totalCases, resolvedCases, pendingCases] = await Promise.all([
          CaseModel.countDocuments({ assigned_officer_id: officer._id }),
          CaseModel.countDocuments({ assigned_officer_id: officer._id, status: 'Resolved' }),
          CaseModel.countDocuments({ assigned_officer_id: officer._id, status: { $nin: ['Resolved'] } }),
        ]);
        
        return {
          ...officer.toObject(),
          stats: { totalCases, resolvedCases, pendingCases },
        };
      })
    );
    
    res.json(officersWithStats);
  } catch (err) {
    next(err);
  }
});

// Get user stats
router.get('/:id/stats', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-passwordHash');
    if (!user) throw createError(404, 'User not found');
    
    // If supervisor, can only see stats for their officers
    if (req.user.role === 'supervisor') {
      if (user.supervisor_id?.toString() !== req.user.sub) {
        throw createError(403, 'Access denied');
      }
    }
    
    // Get check-ins created by this user
    const checkIns = await CheckInModel.find({ officer_id: user._id });
    const checkInIds = checkIns.map(c => c._id);
    
    // Get cases
    const [totalCases, resolvedCases, pendingCases, escalatedCases] = await Promise.all([
      CaseModel.countDocuments({ assigned_officer_id: user._id }),
      CaseModel.countDocuments({ assigned_officer_id: user._id, status: 'Resolved' }),
      CaseModel.countDocuments({ assigned_officer_id: user._id, status: { $nin: ['Resolved', 'Escalated'] } }),
      CaseModel.countDocuments({ assigned_officer_id: user._id, status: 'Escalated' }),
    ]);
    
    // Calculate total fines collected
    const finesResult = await CheckInModel.aggregate([
      { $match: { officer_id: user._id } },
      { $group: { _id: null, total: { $sum: '$fine' } } },
    ]);
    const totalFines = finesResult[0]?.total || 0;
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
        createdAt: user.createdAt,
      },
      stats: {
        totalCases,
        resolvedCases,
        pendingCases,
        escalatedCases,
        totalCheckIns: checkIns.length,
        totalFines,
        resolutionRate: totalCases > 0 ? Math.round((resolvedCases / totalCases) * 100) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get single user (admin only, or own profile)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id)
      .select('-passwordHash')
      .populate('supervisor_id', 'name email role');
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

    // Check if email already exists (case-insensitive)
    const existing = await UserModel.findOne({ 
      email: { $regex: new RegExp(`^${value.email.toLowerCase()}$`, 'i') }
    });
    if (existing) {
      console.log('Email conflict found:', { 
        existingId: existing._id, 
        existingEmail: existing.email,
        requestedEmail: value.email.toLowerCase()
      });
      throw createError(400, 'Email already exists');
    }

    // Validate supervisor_id if provided
    if (value.supervisor_id) {
      const supervisor = await UserModel.findById(value.supervisor_id);
      if (!supervisor || !['supervisor', 'admin'].includes(supervisor.role)) {
        throw createError(400, 'Invalid supervisor');
      }
    }

    const passwordHash = await bcrypt.hash(value.password, 10);

    let user;
    try {
      user = await UserModel.create({
        email: value.email.toLowerCase(),
        name: value.name,
        passwordHash,
        role: value.role,
        status: value.status || 'active',
        supervisor_id: value.supervisor_id || null,
      });
    } catch (dbError) {
      // Handle MongoDB duplicate key error
      if (dbError.code === 11000 || dbError.name === 'MongoServerError') {
        console.error('MongoDB duplicate key error:', dbError);
        throw createError(400, 'Email already exists in database');
      }
      throw dbError;
    }

    await recordAudit({
      action: 'create',
      entity: 'user',
      entityId: user.id,
      userId: req.user?.sub,
      details: { email: user.email, name: user.name, role: user.role },
    });

    const userResponse = await UserModel.findById(user.id)
      .select('-passwordHash')
      .populate('supervisor_id', 'name email role');
    res.status(201).json(userResponse);
  } catch (err) {
    // If it's already an HTTP error, pass it through
    if (err.status || err.statusCode) {
      return next(err);
    }
    // Otherwise, wrap it
    console.error('Create user error:', err);
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

    // Non-admins can't change role, status, or supervisor
    if (!isAdmin) {
      delete value.role;
      delete value.status;
      delete value.supervisor_id;
    }

    // Validate supervisor_id if provided
    if (value.supervisor_id) {
      const supervisor = await UserModel.findById(value.supervisor_id);
      if (!supervisor || !['supervisor', 'admin'].includes(supervisor.role)) {
        throw createError(400, 'Invalid supervisor');
      }
    } else if (value.supervisor_id === '' || value.supervisor_id === null) {
      value.supervisor_id = null;
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

    const userResponse = await UserModel.findById(user.id)
      .select('-passwordHash')
      .populate('supervisor_id', 'name email role');
    res.json(userResponse);
  } catch (err) {
    next(err);
  }
});

// Update user status (admin only)
router.patch('/:id/status', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!UserStatus.includes(status)) {
      throw createError(400, 'Invalid status');
    }

    const user = await UserModel.findById(req.params.id);
    if (!user) throw createError(404, 'User not found');

    // Prevent deactivating yourself
    if (req.user?.sub === req.params.id && status !== 'active') {
      throw createError(400, 'Cannot deactivate your own account');
    }

    user.status = status;
    await user.save();

    await recordAudit({
      action: 'update_status',
      entity: 'user',
      entityId: user.id,
      userId: req.user?.sub,
      details: { status },
    });

    res.json({ message: 'Status updated', status: user.status });
  } catch (err) {
    next(err);
  }
});

// Assign supervisor to user (admin only)
router.put('/:id/assign-supervisor', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { supervisor_id } = req.body;
    
    const user = await UserModel.findById(req.params.id);
    if (!user) throw createError(404, 'User not found');

    if (supervisor_id) {
      const supervisor = await UserModel.findById(supervisor_id);
      if (!supervisor || !['supervisor', 'admin'].includes(supervisor.role)) {
        throw createError(400, 'Invalid supervisor');
      }
      user.supervisor_id = supervisor_id;
    } else {
      user.supervisor_id = null;
    }

    await user.save();

    await recordAudit({
      action: 'assign_supervisor',
      entity: 'user',
      entityId: user.id,
      userId: req.user?.sub,
      details: { supervisor_id },
    });

    const userResponse = await UserModel.findById(user.id)
      .select('-passwordHash')
      .populate('supervisor_id', 'name email role');
    res.json(userResponse);
  } catch (err) {
    next(err);
  }
});

// Bulk delete users (admin only)
router.post('/bulk-delete', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw createError(400, 'userIds must be a non-empty array');
    }

    // Filter out the current user
    const idsToDelete = userIds.filter(id => id !== req.user?.sub);

    const result = await UserModel.deleteMany({ _id: { $in: idsToDelete } });

    await recordAudit({
      action: 'bulk_delete',
      entity: 'user',
      userId: req.user?.sub,
      details: { deletedCount: result.deletedCount, userIds: idsToDelete },
    });

    res.json({ message: `Deleted ${result.deletedCount} users`, deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

// Bulk assign supervisor (admin only)
router.post('/bulk-assign', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const { userIds, supervisor_id } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw createError(400, 'userIds must be a non-empty array');
    }

    if (supervisor_id) {
      const supervisor = await UserModel.findById(supervisor_id);
      if (!supervisor || !['supervisor', 'admin'].includes(supervisor.role)) {
        throw createError(400, 'Invalid supervisor');
      }
    }

    const result = await UserModel.updateMany(
      { _id: { $in: userIds } },
      { supervisor_id: supervisor_id || null }
    );

    await recordAudit({
      action: 'bulk_assign_supervisor',
      entity: 'user',
      userId: req.user?.sub,
      details: { modifiedCount: result.modifiedCount, userIds, supervisor_id },
    });

    res.json({ message: `Updated ${result.modifiedCount} users`, modifiedCount: result.modifiedCount });
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
