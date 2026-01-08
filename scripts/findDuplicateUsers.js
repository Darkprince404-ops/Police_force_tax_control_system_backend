import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from '../src/models/index.js';

dotenv.config();

const findDuplicateUsers = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find all users
    const allUsers = await UserModel.find({}).select('_id email name role status createdAt');
    
    console.log(`📊 Total users in database: ${allUsers.length}\n`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Group by email (case-insensitive)
    const emailMap = new Map();
    allUsers.forEach(user => {
      const emailLower = user.email.toLowerCase();
      if (!emailMap.has(emailLower)) {
        emailMap.set(emailLower, []);
      }
      emailMap.get(emailLower).push(user);
    });

    // Find duplicates
    const duplicates = [];
    emailMap.forEach((users, email) => {
      if (users.length > 1) {
        duplicates.push({ email, users });
      }
    });

    if (duplicates.length === 0) {
      console.log('✅ No duplicate emails found!\n');
    } else {
      console.log(`⚠️  Found ${duplicates.length} duplicate email(s):\n`);
      duplicates.forEach(({ email, users }) => {
        console.log(`📧 Email: ${email}`);
        users.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ID: ${user._id}`);
          console.log(`      Name: ${user.name}`);
          console.log(`      Role: ${user.role}`);
          console.log(`      Status: ${user.status}`);
          console.log(`      Created: ${user.createdAt}`);
          console.log('');
        });
        console.log('   ────────────────────────────────────────────────\n');
      });
    }

    // Search for specific email if provided
    const searchEmail = process.argv[2];
    if (searchEmail) {
      console.log(`\n🔍 Searching for: ${searchEmail}\n`);
      const found = await UserModel.find({ 
        email: { $regex: new RegExp(`^${searchEmail.toLowerCase()}$`, 'i') }
      }).select('_id email name role status createdAt');
      
      if (found.length === 0) {
        console.log(`✅ No users found with email: ${searchEmail}\n`);
      } else {
        console.log(`Found ${found.length} user(s) with this email:\n`);
        found.forEach((user, idx) => {
          console.log(`${idx + 1}. ID: ${user._id}`);
          console.log(`   Email: ${user.email}`);
          console.log(`   Name: ${user.name}`);
          console.log(`   Role: ${user.role}`);
          console.log(`   Status: ${user.status}`);
          console.log(`   Created: ${user.createdAt}`);
          console.log('');
        });
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

findDuplicateUsers();

