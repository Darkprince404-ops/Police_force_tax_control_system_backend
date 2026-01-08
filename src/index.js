import mongoose from 'mongoose';

import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { checkComebackDates } from './services/notificationService.js';
import { initGridFS } from './utils/gridfs.js';

// Scheduled job to check comeback dates every hour
const scheduleComebackCheck = () => {
  // Check immediately on startup
  checkComebackDates().catch((err) => {
    logger.error({ err }, 'Error checking comeback dates on startup');
  });
  
  // Then check every hour
  setInterval(() => {
    checkComebackDates()
      .then((result) => {
        if (result.notifications > 0) {
          logger.info(`Sent ${result.notifications} comeback date notifications`);
        }
      })
      .catch((err) => {
        logger.error({ err }, 'Error checking comeback dates');
      });
  }, 60 * 60 * 1000); // 1 hour
};

const start = async () => {
  try {
    await mongoose.connect(config.mongoUri, {
      maxPoolSize: 10, // Limit connection pool size
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB connected');

    // Initialize GridFS for file storage
    initGridFS();
    logger.info('GridFS initialized');

    // Start scheduled job for comeback date notifications
    scheduleComebackCheck();
    logger.info('Comeback date notification scheduler started');

    const app = createApp();
    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port}`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
};

start();

