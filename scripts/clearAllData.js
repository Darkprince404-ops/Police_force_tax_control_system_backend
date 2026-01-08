import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { BusinessModel, CaseModel, CheckInModel } from '../src/models/index.js';
import { NotificationModel } from '../src/models/notification.js';

dotenv.config();

const clearAllData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');
    console.log('');
    console.log('🗑️  Clearing all data...');
    console.log('═══════════════════════════════════════');

    // Delete notifications
    const deletedNotifications = await NotificationModel.deleteMany({});
    console.log(`✅ Deleted ${deletedNotifications.deletedCount} notifications`);

    // Delete cases
    const deletedCases = await CaseModel.deleteMany({});
    console.log(`✅ Deleted ${deletedCases.deletedCount} cases`);

    // Delete check-ins
    const deletedCheckIns = await CheckInModel.deleteMany({});
    console.log(`✅ Deleted ${deletedCheckIns.deletedCount} check-ins`);

    // Delete businesses
    const deletedBusinesses = await BusinessModel.deleteMany({});
    console.log(`✅ Deleted ${deletedBusinesses.deletedCount} businesses`);

    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('✅ All data cleared successfully!');
    console.log('');
    console.log('💡 Users (admin, officers, supervisors) are preserved.');
    console.log('💡 Run "node scripts/seedData.js" to add sample data again.');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing data:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

clearAllData();

