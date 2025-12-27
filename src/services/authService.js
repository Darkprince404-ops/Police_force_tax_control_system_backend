import bcrypt from 'bcryptjs';
import createError from 'http-errors';

import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { UserModel } from '../models/index.js';
import { recordAudit } from './auditService.js';

export const login = async (email, password, twoFactorCode) => {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) throw createError(401, 'Invalid credentials');
  
  // Check user status before allowing login
  if (user.status === 'inactive') {
    throw createError(403, 'Your account is inactive. Please contact an administrator.');
  }
  if (user.status === 'suspended') {
    throw createError(403, 'Your account has been suspended. Please contact an administrator.');
  }
  
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw createError(401, 'Invalid credentials');

  // Optional 2FA for admins when env is set
  if (user.role === 'admin' && process.env.ADMIN_2FA_CODE) {
    if (!twoFactorCode || twoFactorCode !== process.env.ADMIN_2FA_CODE) {
      throw createError(401, 'Two-factor code required');
    }
  }

  // Update login tracking
  user.lastLoginAt = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  const payload = { sub: user.id, role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await recordAudit({ action: 'login', entity: 'user', entityId: user.id, userId: user.id });

  return {
    user: { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role,
      status: user.status || 'active',
      lastLoginAt: user.lastLoginAt,
    },
    accessToken,
    refreshToken,
  };
};

export const refresh = async (token) => {
  const payload = verifyRefreshToken(token);
  const accessToken = signAccessToken({ sub: payload.sub, role: payload.role, email: payload.email });
  return { accessToken };
};

