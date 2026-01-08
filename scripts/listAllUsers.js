import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from '../src/models/index.js';

dotenv.config();

const listAllUsers = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const users = await UserModel.find({}).select('_id email name role status createdAt').sort({ createdAt: -1 });
    
    console.log(`📊 Total users: ${users.length}\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    users.forEach((user, idx) => {
      console.log(`${idx + 1}. Email: ${user.email}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log('');
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

listAllUsers();

