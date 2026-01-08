import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { checkComebackDates } from '../src/services/notificationService.js';

const triggerNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control');
    console.log('✅ Connected to MongoDB');

    console.log('🔔 Checking for comeback dates and sending notifications...');
    const result = await checkComebackDates();
    
    console.log(`✅ Notification check completed:`);
    console.log(`   - Cases checked: ${result.checked}`);
    console.log(`   - Notifications sent: ${result.notifications}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error triggering notifications:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

triggerNotifications();

