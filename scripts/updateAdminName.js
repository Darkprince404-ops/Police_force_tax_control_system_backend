import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { UserModel } from '../src/models/user.js';

dotenv.config();

const updateAdminName = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');

    const result = await UserModel.updateMany(
      { role: 'admin' },
      { name: 'Shaafici abdullahi Mohamed' }
    );

    console.log(`✅ Updated ${result.modifiedCount} admin user(s) with new name: Shaafici abdullahi Mohamed`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin name:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

updateAdminName();

