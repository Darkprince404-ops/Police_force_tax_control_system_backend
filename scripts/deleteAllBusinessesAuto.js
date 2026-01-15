import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  BusinessModel,
  CaseModel,
  CheckInModel,
  EditRequestModel,
  PaymentModel,
  EvidenceModel,
  DuplicateReviewModel,
  NotificationModel,
  TaskModel,
} from '../src/models/index.js';

dotenv.config();

/**
 * ⚠️  AUTOMATED PRODUCTION DELETION SCRIPT
 * 
 * This script automatically deletes ALL businesses and ALL related data
 * WITHOUT requiring manual confirmation.
 * 
 * REQUIRES: MONGO_URI environment variable set to production database
 */
const deleteAllBusinessesAuto = async () => {
  try {
    // Require MONGO_URI to be explicitly set
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ ERROR: MONGO_URI environment variable is not set!');
      process.exit(1);
    }

    // Show which database (mask password)
    const displayUri = mongoUri
      .replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')
      .replace(/:[^@]+@/, ':***@');
    
    console.log('');
    console.log('⚠️  ⚠️  ⚠️  AUTOMATED PRODUCTION DELETION ⚠️  ⚠️  ⚠️');
    console.log('');
    console.log('🔌 Connecting to MongoDB...');
    console.log(`   Database: ${displayUri}`);
    console.log('');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('');

    // Get counts before deletion
    console.log('📊 Current data counts:');
    console.log('═══════════════════════════════════════');
    const businessCount = await BusinessModel.countDocuments({});
    const checkInCount = await CheckInModel.countDocuments({});
    const caseCount = await CaseModel.countDocuments({});
    const paymentCount = await PaymentModel.countDocuments({});
    const evidenceCount = await EvidenceModel.countDocuments({});
    const editRequestCount = await EditRequestModel.countDocuments({});
    const duplicateReviewCount = await DuplicateReviewModel.countDocuments({});
    const taskCount = await TaskModel.countDocuments({});
    const notificationCount = await NotificationModel.countDocuments({});
    
    console.log(`   Businesses: ${businessCount}`);
    console.log(`   Check-ins: ${checkInCount}`);
    console.log(`   Cases: ${caseCount}`);
    console.log(`   Payments: ${paymentCount}`);
    console.log(`   Evidence: ${evidenceCount}`);
    console.log(`   Edit Requests: ${editRequestCount}`);
    console.log(`   Duplicate Reviews: ${duplicateReviewCount}`);
    console.log(`   Tasks: ${taskCount}`);
    console.log(`   Notifications: ${notificationCount}`);
    console.log('═══════════════════════════════════════');
    console.log('');

    if (businessCount === 0) {
      console.log('✅ No businesses found. Nothing to delete.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get all business IDs
    const businessIds = await BusinessModel.find({}).select('_id').then(bs => bs.map(b => b._id));

    console.log('⚠️  Starting automatic deletion...');
    console.log(`   Will delete: ${businessCount} businesses, ${checkInCount} check-ins, ${caseCount} cases`);
    console.log('');
    console.log('⏳ Waiting 2 seconds before deletion...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');

    console.log('🗑️  Starting deletion...');
    console.log('═══════════════════════════════════════');

    // Get check-in IDs for case deletion
    const checkIns = await CheckInModel.find({ business_id: { $in: businessIds } }).select('_id');
    const checkInIds = checkIns.map(ci => ci._id);

    // Delete in order (respecting foreign key relationships)
    const deletedNotifications = await NotificationModel.deleteMany({
      $or: [
        { entityType: 'case' },
        { entityType: 'business' },
        { 'metadata.businessId': { $in: businessIds } },
      ],
    });
    console.log(`✅ Deleted ${deletedNotifications.deletedCount} notifications`);

    const deletedTasks = await TaskModel.deleteMany({
      $or: [
        { business_id: { $in: businessIds } },
        { case_id: { $exists: true } },
      ],
    });
    console.log(`✅ Deleted ${deletedTasks.deletedCount} tasks`);

    const deletedDuplicateReviews = await DuplicateReviewModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedDuplicateReviews.deletedCount} duplicate reviews`);

    const deletedEditRequests = await EditRequestModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedEditRequests.deletedCount} edit requests`);

    const deletedEvidence = await EvidenceModel.deleteMany({
      case_id: { $exists: true },
    });
    console.log(`✅ Deleted ${deletedEvidence.deletedCount} evidence files`);

    const deletedPayments = await PaymentModel.deleteMany({
      case_id: { $exists: true },
    });
    console.log(`✅ Deleted ${deletedPayments.deletedCount} payments`);

    const deletedCases = await CaseModel.deleteMany({
      check_in_id: { $in: checkInIds },
    });
    console.log(`✅ Deleted ${deletedCases.deletedCount} cases`);

    const deletedCheckIns = await CheckInModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedCheckIns.deletedCount} check-ins`);

    console.log('');
    console.log('🗑️  Deleting businesses...');
    const deletedBusinesses = await BusinessModel.deleteMany({});
    console.log(`✅ Deleted ${deletedBusinesses.deletedCount} businesses`);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('✅ All businesses and related data deleted successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   - Businesses deleted: ${deletedBusinesses.deletedCount}`);
    console.log(`   - Check-ins deleted: ${deletedCheckIns.deletedCount}`);
    console.log(`   - Cases deleted: ${deletedCases.deletedCount}`);
    console.log(`   - Payments deleted: ${deletedPayments.deletedCount}`);
    console.log(`   - Evidence deleted: ${deletedEvidence.deletedCount}`);
    console.log(`   - Edit requests deleted: ${deletedEditRequests.deletedCount}`);
    console.log(`   - Duplicate reviews deleted: ${deletedDuplicateReviews.deletedCount}`);
    console.log(`   - Tasks deleted: ${deletedTasks.deletedCount}`);
    console.log(`   - Notifications deleted: ${deletedNotifications.deletedCount}`);
    console.log('');
    console.log('💡 Users, login events, audit logs, and business types are preserved.');
    console.log('');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Error deleting businesses:', error);
    console.error('');
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the script
deleteAllBusinessesAuto();
