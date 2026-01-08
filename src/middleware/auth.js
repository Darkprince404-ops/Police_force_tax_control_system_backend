import createError from 'http-errors';

import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError(401, 'Unauthorized');
    }
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(createError(401, 'Unauthorized'));
  }
};

