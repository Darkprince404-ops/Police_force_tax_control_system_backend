import { Router } from 'express';
import createError from 'http-errors';
import Joi from 'joi';

import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { TaskModel, CaseModel, UserModel } from '../models/index.js';
import { recordAudit } from '../services/auditService.js';

const router = Router();

const taskSchema = Joi.object({
  title: Joi.string().required().trim(),
  description: Joi.string().allow('', null),
  type: Joi.string().valid('case', 'general').required(),
  status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled'),
  assigned_to: Joi.string().required(),
  case_id: Joi.string().allow('', null),
  due_date: Joi.date().allow(null),
  priority: Joi.string().valid('low', 'medium', 'high'),
});

// List tasks with filters
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { assigned_to, status, type, case_id } = req.query;
    const filter = {};

    // Regular users can only see their own tasks
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      filter.assigned_to = req.user?.sub;
    } else if (assigned_to) {
      filter.assigned_to = assigned_to;
    }

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (case_id) filter.case_id = case_id;

    const tasks = await TaskModel.find(filter)
      .populate('assigned_to', 'name email')
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get tasks for specific user
router.get('/user/:userId', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Regular users can only see their own tasks
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor' && req.user?.sub !== userId) {
      throw createError(403, 'Access denied');
    }

    const tasks = await TaskModel.find({ assigned_to: userId })
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number')
      .sort({ priority: -1, due_date: 1, createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Create task
router.post('/', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { error, value } = taskSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    // Validate assigned_to user exists
    const assignedUser = await UserModel.findById(value.assigned_to);
    if (!assignedUser) {
      throw createError(400, 'Assigned user not found');
    }

    // Validate case_id if type is 'case'
    if (value.type === 'case' && value.case_id) {
      const caseDoc = await CaseModel.findById(value.case_id);
      if (!caseDoc) throw createError(400, 'Case not found');
    }

    // Clean up empty case_id for general tasks
    if (value.type === 'general' && (!value.case_id || value.case_id.trim() === '')) {
      delete value.case_id;
    }

    const task = await TaskModel.create({
      ...value,
      assigned_by: req.user?.sub,
      status: value.status || 'pending',
      priority: value.priority || 'medium',
    });

    await recordAudit({
      action: 'create',
      entity: 'task',
      entityId: task.id,
      userId: req.user?.sub,
      details: value,
    });

    const populated = await TaskModel.findById(task.id)
      .populate('assigned_to', 'name email')
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number');

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

// Update task
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) throw createError(404, 'Task not found');

    // Users can only update their own tasks, unless admin/supervisor
    if (
      req.user?.role !== 'admin' &&
      req.user?.role !== 'supervisor' &&
      String(task.assigned_to) !== req.user?.sub
    ) {
      throw createError(403, 'Access denied');
    }

    const updateSchema = Joi.object({
      title: Joi.string().trim(),
      description: Joi.string().allow('', null),
      status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled'),
      due_date: Joi.date().allow(null),
      priority: Joi.string().valid('low', 'medium', 'high'),
      assigned_to: Joi.string(), // Only admin/supervisor can reassign
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) throw createError(400, error.message);

    // Only admin/supervisor can reassign
    if (value.assigned_to && req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      delete value.assigned_to;
    }

    Object.assign(task, value);
    await task.save();

    await recordAudit({
      action: 'update',
      entity: 'task',
      entityId: task.id,
      userId: req.user?.sub,
      details: value,
    });

    const populated = await TaskModel.findById(task.id)
      .populate('assigned_to', 'name email')
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number');

    res.json(populated);
  } catch (err) {
    next(err);
  }
});

// Assign task to user
router.post('/:id/assign', requireAuth, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id);
    if (!task) throw createError(404, 'Task not found');

    const { assigned_to } = req.body;
    if (!assigned_to) throw createError(400, 'assigned_to is required');

    task.assigned_to = assigned_to;
    await task.save();

    await recordAudit({
      action: 'update',
      entity: 'task',
      entityId: task.id,
      userId: req.user?.sub,
      details: { assigned_to },
    });

    const populated = await TaskModel.findById(task.id)
      .populate('assigned_to', 'name email')
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number');

    res.json(populated);
  } catch (err) {
    next(err);
  }
});

// Get single task
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const task = await TaskModel.findById(req.params.id)
      .populate('assigned_to', 'name email')
      .populate('assigned_by', 'name email')
      .populate('case_id', 'case_number');

    if (!task) throw createError(404, 'Task not found');

    // Users can only view their own tasks, unless admin/supervisor
    if (
      req.user?.role !== 'admin' &&
      req.user?.role !== 'supervisor' &&
      String(task.assigned_to._id) !== req.user?.sub
    ) {
      throw createError(403, 'Access denied');
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

export const taskRoutes = router;

