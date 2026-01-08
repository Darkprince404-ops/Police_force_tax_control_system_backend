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

  app.use('/api', routes);
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
    res.status(404).json({ message: 'Not Found' });
  });

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || 'Internal Server Error',
      status,
    });
  });

  return app;
};

