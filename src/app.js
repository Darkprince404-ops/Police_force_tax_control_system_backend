import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { config } from './config.js';
import { httpLogger } from './logger.js';
import { routes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createApp = () => {
  const app = express();

  // Configure helmet to allow images
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  
  // CORS configuration - allow Vercel deployments and localhost
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow all Vercel deployments
        if (origin.includes('vercel.app')) {
          return callback(null, true);
        }
        
        // Allow configured frontend URL
        if (config.urls.frontendBase && origin === config.urls.frontendBase) {
          return callback(null, true);
        }
        
        // Allow localhost for development
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
        
        // Allow all in production for now (can be tightened later)
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());
  app.use(morgan('dev'));
  app.use(httpLogger);

  // #region agent log
  console.log('[DEBUG] Registering routes at /api');
  // #endregion
  app.use('/api', routes);
  // #region agent log
  console.log('[DEBUG] Routes registered, adding 404 handler');
  // #endregion
  // Serve uploaded files with CORS headers
  app.use(
    '/uploads',
    (req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      next();
    },
    express.static(path.join(process.cwd(), 'uploads')),
  );

  app.use((req, res) => {
    // #region agent log
    console.log('[DEBUG] 404 handler hit', { method: req.method, url: req.url, path: req.path, originalUrl: req.originalUrl });
    // #endregion
    res.status(404).json({ message: 'Not Found', path: req.path, method: req.method });
  });

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    // #region agent log
    console.error('[ERROR HANDLER]', {
      status,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      url: req.url,
      name: err.name,
      code: err.code
    });
    // #endregion
    res.status(status).json({
      message: err.message || 'Internal Server Error',
      status,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  return app;
};

