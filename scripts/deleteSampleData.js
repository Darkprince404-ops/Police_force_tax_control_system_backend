import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { BusinessModel, CaseModel, CheckInModel, UserModel } from '../src/models/index.js';

dotenv.config();

const deleteSampleData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');

    // Delete businesses with "Sample" in the name
    const sampleBusinesses = await BusinessModel.find({
      $or: [
        { business_name: { $regex: /sample/i } },
        { owner_name: { $regex: /owner \d+/i } },
      ],
    });

    if (sampleBusinesses.length > 0) {
      const businessIds = sampleBusinesses.map((b) => b._id);
      
      // Delete cases related to these businesses
      const checkIns = await CheckInModel.find({ business_id: { $in: businessIds } });
      const checkInIds = checkIns.map((c) => c._id);
      
      if (checkInIds.length > 0) {
        const deletedCases = await CaseModel.deleteMany({ check_in_id: { $in: checkInIds } });
        console.log(`✅ Deleted ${deletedCases.deletedCount} cases related to sample businesses`);
      }
    }
    
    // Also delete all existing cases and check-ins to start fresh
    const allCases = await CaseModel.countDocuments();
    const allCheckIns = await CheckInModel.countDocuments();
    
    if (allCases > 0) {
      const deletedAllCases = await CaseModel.deleteMany({});
      console.log(`✅ Deleted ${deletedAllCases.deletedCount} existing cases`);
    }
    
    if (allCheckIns > 0) {
      const deletedAllCheckIns = await CheckInModel.deleteMany({});
      console.log(`✅ Deleted ${deletedAllCheckIns.deletedCount} existing check-ins`);
    }
    
    if (sampleBusinesses.length === 0) {
      
      // Delete check-ins
      if (checkIns.length > 0) {
        const deletedCheckIns = await CheckInModel.deleteMany({ business_id: { $in: businessIds } });
        console.log(`✅ Deleted ${deletedCheckIns.deletedCount} check-ins related to sample businesses`);
      }
      
      // Delete businesses
      const deletedBusinesses = await BusinessModel.deleteMany({
        _id: { $in: businessIds },
      });
      console.log(`✅ Deleted ${deletedBusinesses.deletedCount} sample businesses`);
    } else {
      console.log('⚠️  No sample businesses found');
    }

    // Delete users with test/sample names
    const sampleUsers = await UserModel.find({
      $or: [
        { name: { $regex: /test|sample/i } },
        { email: { $regex: /test|sample/i } },
      ],
    }).select('_id name email role');

    if (sampleUsers.length > 0) {
      // Check if these users have created any data
      for (const user of sampleUsers) {
        const hasCases = await CaseModel.exists({ assigned_officer_id: user._id });
        const hasBusinesses = await BusinessModel.exists({});
        
        if (!hasCases && !hasBusinesses) {
          await UserModel.deleteOne({ _id: user._id });
          console.log(`✅ Deleted sample user: ${user.name} (${user.email})`);
        } else {
          console.log(`⚠️  Skipped user ${user.name} - has associated data`);
        }
      }
    } else {
      console.log('⚠️  No sample users found');
    }

    console.log('\n✅ Sample data cleanup completed!');
    console.log('\n💡 You can now run: node scripts/seedData.js to add real Somali data');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting sample data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

deleteSampleData();

