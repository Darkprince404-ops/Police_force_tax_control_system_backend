import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from '../src/models/index.js';

dotenv.config();

const cleanupDuplicateEmails = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    const allUsers = await UserModel.find({}).select('_id email name role status createdAt');
    console.log(`📊 Total users: ${allUsers.length}\n`);

    // Group by normalized email (lowercase, trimmed)
    const emailGroups = new Map();
    allUsers.forEach(user => {
      const normalized = user.email.toLowerCase().trim();
      if (!emailGroups.has(normalized)) {
        emailGroups.set(normalized, []);
      }
      emailGroups.get(normalized).push(user);
    });

    // Find and delete duplicates
    let deletedCount = 0;
    const duplicates = [];

    emailGroups.forEach((users, normalizedEmail) => {
      if (users.length > 1) {
        duplicates.push({ email: normalizedEmail, users });
        // Sort by creation date, keep the newest
        const sorted = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const keep = sorted[0];
        const toDelete = sorted.slice(1);

        console.log(`⚠️  Found ${users.length} users with email: ${normalizedEmail}`);
        console.log(`   ✅ Keeping: ${keep._id} (${keep.name}, created: ${keep.createdAt})`);
        
        toDelete.forEach(user => {
          console.log(`   🗑️  Deleting: ${user._id} (${user.name}, created: ${user.createdAt})`);
        });
        console.log('');

        // Delete duplicates
        toDelete.forEach(async (user) => {
          await UserModel.findByIdAndDelete(user._id);
          deletedCount++;
        });
      }
    });

    if (duplicates.length === 0) {
      console.log('✅ No duplicate emails found!\n');
    } else {
      console.log(`\n✅ Cleaned up ${deletedCount} duplicate user(s)\n`);
    }

    // Check for specific problematic emails
    const problematicEmails = [
      'admin@police.gov.so',
      'admin@police.gov.so ',
      'Admin@police.gov.so',
      'ADMIN@POLICE.GOV.SO',
    ];

    console.log('🔍 Checking for problematic email variations...\n');
    for (const email of problematicEmails) {
      const found = await UserModel.find({ 
        email: { $regex: new RegExp(`^${email.toLowerCase().trim()}$`, 'i') }
      });
      
      if (found.length > 0) {
        console.log(`⚠️  Found ${found.length} user(s) with email variation: ${email}`);
        found.forEach(user => {
          console.log(`   - ID: ${user._id}, Email: ${user.email}, Name: ${user.name}`);
        });
        console.log('');
      }
    }

    // Drop and recreate email index to fix any index corruption
    console.log('🔧 Rebuilding email index...\n');
    try {
      await UserModel.collection.dropIndex('email_1');
      console.log('   ✅ Dropped existing email index\n');
    } catch (err) {
      if (err.code !== 27) { // Index not found is OK
        console.log(`   ⚠️  Could not drop index: ${err.message}\n`);
      }
    }

    // Recreate the index
    await UserModel.collection.createIndex({ email: 1 }, { unique: true });
    console.log('   ✅ Recreated email unique index\n');

    // Final verification
    const finalCount = await UserModel.countDocuments({});
    console.log(`📊 Final user count: ${finalCount}\n`);
    console.log('✅ Cleanup complete!\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
};

cleanupDuplicateEmails();

