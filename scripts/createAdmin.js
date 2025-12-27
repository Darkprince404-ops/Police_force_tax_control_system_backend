import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { config } from '../src/config.js';
import { UserModel } from '../src/models/user.js';
import { Roles } from '../src/constants/enums.js';

dotenv.config();

const createAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');

    const adminEmail = config.defaults.adminEmail;
    const adminPassword = config.defaults.adminPassword;

    // Check if admin already exists
    const existingAdmin = await UserModel.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`✅ Admin user already exists: ${adminEmail}`);
      console.log(`   You can login with these credentials.`);
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await UserModel.create({
      email: adminEmail,
      name: 'Shaafici abdullahi Mohamed',
      passwordHash,
      role: 'admin',
    });

    console.log('✅ Admin user created successfully!');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: ${admin.role}`);
    console.log('\n📝 IMPORTANT: Please change the password after first login!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createAdmin();

