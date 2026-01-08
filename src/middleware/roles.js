import createError from 'http-errors';

import { Roles } from '../constants/enums.js';

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(createError(403, 'Forbidden'));
    }
    return next();
  };
};

