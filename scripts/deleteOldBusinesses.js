import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { BusinessModel, CheckInModel, CaseModel, EditRequestModel } from '../src/models/index.js';

const deleteOldBusinesses = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log(`\n📅 Filtering businesses registered before: ${today.toISOString()}`);

    // Find all businesses registered before today
    const oldBusinesses = await BusinessModel.find({
      createdAt: { $lt: today },
    });

    console.log(`\n📊 Found ${oldBusinesses.length} businesses to delete`);

    if (oldBusinesses.length === 0) {
      console.log('✅ No old businesses to delete');
      await mongoose.disconnect();
      return;
    }

    // Show businesses that will be kept (registered today)
    const todayBusinesses = await BusinessModel.find({
      createdAt: { $gte: today, $lt: tomorrow },
    });
    console.log(`\n✅ ${todayBusinesses.length} businesses will be kept (registered today)`);

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete:');
    console.log(`   - ${oldBusinesses.length} businesses`);
    console.log(`   - All related check-ins`);
    console.log(`   - All related cases`);
    console.log(`   - All related edit requests`);

    // Get counts of related data
    const businessIds = oldBusinesses.map((b) => b._id);
    
    const checkInsCount = await CheckInModel.countDocuments({
      business_id: { $in: businessIds },
    });
    
    const casesCount = await CaseModel.countDocuments({
      'check_in_id.business_id': { $in: businessIds },
    }).populate({
      path: 'check_in_id',
      select: 'business_id',
    });

    // Also count cases by checking check-ins
    const checkIns = await CheckInModel.find({
      business_id: { $in: businessIds },
    }).select('_id');
    const checkInIds = checkIns.map((ci) => ci._id);
    const actualCasesCount = await CaseModel.countDocuments({
      check_in_id: { $in: checkInIds },
    });

    const editRequestsCount = await EditRequestModel.countDocuments({
      business_id: { $in: businessIds },
    });

    console.log(`\n📊 Related data to be deleted:`);
    console.log(`   - ${checkInsCount} check-ins`);
    console.log(`   - ${actualCasesCount} cases`);
    console.log(`   - ${editRequestsCount} edit requests`);

    // Delete related data first
    console.log('\n🗑️  Deleting related data...');

    // Delete edit requests
    if (editRequestsCount > 0) {
      const deletedRequests = await EditRequestModel.deleteMany({
        business_id: { $in: businessIds },
      });
      console.log(`   ✅ Deleted ${deletedRequests.deletedCount} edit requests`);
    }

    // Delete cases
    if (actualCasesCount > 0) {
      const deletedCases = await CaseModel.deleteMany({
        check_in_id: { $in: checkInIds },
      });
      console.log(`   ✅ Deleted ${deletedCases.deletedCount} cases`);
    }

    // Delete check-ins
    if (checkInsCount > 0) {
      const deletedCheckIns = await CheckInModel.deleteMany({
        business_id: { $in: businessIds },
      });
      console.log(`   ✅ Deleted ${deletedCheckIns.deletedCount} check-ins`);
    }

    // Delete businesses
    console.log('\n🗑️  Deleting businesses...');
    const deletedBusinesses = await BusinessModel.deleteMany({
      createdAt: { $lt: today },
    });
    console.log(`   ✅ Deleted ${deletedBusinesses.deletedCount} businesses`);

    console.log('\n✅ Cleanup completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Businesses deleted: ${deletedBusinesses.deletedCount}`);
    console.log(`   - Businesses kept: ${todayBusinesses.length}`);
  } catch (error) {
    console.error('❌ Error deleting old businesses:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
};

// Run the script
deleteOldBusinesses()
  .then(() => {
    console.log('\n✨ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

