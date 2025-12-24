import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { UserModel } from '../src/models/user.js';
import { Roles } from '../src/constants/enums.js';

dotenv.config();

const createUser = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');

    // Get arguments from command line or use defaults
    const args = process.argv.slice(2);
    const email = args[0] || 'officer@example.com';
    const name = args[1] || 'Mohamed Ali';
    const password = args[2] || 'Test123!';
    const role = args[3] || 'officer';

    // Validate role
    if (!Roles.includes(role)) {
      console.error(`❌ Invalid role. Must be one of: ${Roles.join(', ')}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`⚠️  User already exists: ${email}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Role: ${existingUser.role}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      email: email.toLowerCase(),
      name,
      passwordHash,
      role,
    });

    console.log('✅ User created successfully!');
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${user.role}`);
    console.log('\n📝 IMPORTANT: Please change the password after first login!');
    console.log('\n💡 Usage: node scripts/createUser.js [email] [name] [password] [role]');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createUser();

