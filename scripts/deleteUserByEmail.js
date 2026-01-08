import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from '../src/models/index.js';

dotenv.config();

const deleteUserByEmail = async (email) => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    if (!email) {
      console.error('❌ Please provide an email address');
      console.log('Usage: node scripts/deleteUserByEmail.js <email>');
      await mongoose.disconnect();
      process.exit(1);
    }

    const emailLower = email.toLowerCase().trim();
    console.log(`🔍 Searching for users with email: ${emailLower}\n`);

    // Find all users with this email (case-insensitive)
    const users = await UserModel.find({ 
      email: { $regex: new RegExp(`^${emailLower}$`, 'i') }
    }).select('_id email name role status createdAt');

    if (users.length === 0) {
      console.log(`✅ No users found with email: ${emailLower}\n`);
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`📧 Found ${users.length} user(s) with this email:\n`);
    users.forEach((user, idx) => {
      console.log(`${idx + 1}. ID: ${user._id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log('');
    });

    // Delete all except the most recent one (or delete all if user wants)
    if (users.length > 1) {
      console.log('⚠️  Multiple users found. Deleting duplicates...\n');
      
      // Sort by creation date, keep the newest
      const sortedUsers = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const keepUser = sortedUsers[0];
      const deleteUsers = sortedUsers.slice(1);

      console.log(`✅ Keeping user: ${keepUser._id} (${keepUser.name}, created: ${keepUser.createdAt})\n`);
      
      for (const user of deleteUsers) {
        console.log(`🗑️  Deleting user: ${user._id} (${user.name})...`);
        await UserModel.findByIdAndDelete(user._id);
        console.log(`   ✅ Deleted successfully\n`);
      }
    } else {
      // Only one user found - ask if they want to delete it
      console.log(`🗑️  Deleting user: ${users[0]._id} (${users[0].name})...`);
      await UserModel.findByIdAndDelete(users[0]._id);
      console.log(`   ✅ Deleted successfully\n`);
    }

    // Verify deletion
    const remaining = await UserModel.find({ 
      email: { $regex: new RegExp(`^${emailLower}$`, 'i') }
    });
    
    if (remaining.length === 0) {
      console.log('✅ All users with this email have been deleted!\n');
    } else {
      console.log(`⚠️  Warning: ${remaining.length} user(s) still exist with this email\n`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Get email from command line argument
const email = process.argv[2];
deleteUserByEmail(email);

