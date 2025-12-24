import dotenv from 'dotenv';

dotenv.config();

const getEnv = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  mongoUri: getEnv('MONGO_URI', 'mongodb://localhost:27017/police-tax-control'),
  jwt: {
    accessSecret: getEnv('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: getEnv('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessExpiresIn: getEnv('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES', '7d'),
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 200),
  },
  defaults: {
    adminEmail: getEnv('ADMIN_DEFAULT_EMAIL', 'admin@example.com'),
    adminPassword: getEnv('ADMIN_DEFAULT_PASSWORD', 'ChangeMe123!'),
  },
  urls: {
    serverBase: process.env.SERVER_BASE_URL || 'http://localhost:4000',
    frontendBase: process.env.FRONTEND_BASE_URL || 'http://localhost:3000',
  },
};

