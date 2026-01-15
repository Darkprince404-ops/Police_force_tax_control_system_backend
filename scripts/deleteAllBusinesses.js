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
  ReportScheduleModel,
} from '../src/models/index.js';

dotenv.config();

/**
 * ⚠️  WARNING: This script deletes ALL businesses and ALL related data
 * 
 * This will delete:
 * - All businesses
 * - All check-ins
 * - All cases
 * - All payments
 * - All evidence
 * - All edit requests
 * - All duplicate reviews
 * - All tasks related to businesses
 * - All notifications related to businesses/cases
 * 
 * This does NOT delete:
 * - Users (admin, officers, supervisors)
 * - Login events
 * - Audit logs
 * - Business types
 * - Import jobs
 */
const deleteAllBusinesses = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    
    // Show which database we're connecting to (mask password)
    const displayUri = mongoUri.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@').replace(/:[^@]+@/, ':***@');
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
    const allBusinesses = await BusinessModel.find({}).select('_id business_name');
    const businessIds = allBusinesses.map(b => b._id);

    console.log('⚠️  WARNING: This will DELETE ALL BUSINESSES and related data!');
    console.log('');
    console.log('🗑️  Items to be deleted:');
    console.log(`   - ${businessCount} businesses`);
    console.log(`   - ${checkInCount} check-ins`);
    console.log(`   - ${caseCount} cases`);
    console.log(`   - ${paymentCount} payments`);
    console.log(`   - ${evidenceCount} evidence files`);
    console.log(`   - ${editRequestCount} edit requests`);
    console.log(`   - ${duplicateReviewCount} duplicate reviews`);
    console.log(`   - ${taskCount} tasks`);
    console.log(`   - ${notificationCount} notifications`);
    console.log('');
    console.log('✅ Items that will be preserved:');
    console.log('   - All users (admin, officers, supervisors)');
    console.log('   - Login events');
    console.log('   - Audit logs');
    console.log('   - Business types');
    console.log('   - Import jobs');
    console.log('');
    console.log('⏳ Starting deletion in 3 seconds...');
    console.log('   (Press Ctrl+C to cancel)');
    console.log('');

    // Wait 3 seconds to allow cancellation
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🗑️  Deleting related data...');
    console.log('═══════════════════════════════════════');

    // Get check-in IDs for case deletion
    const checkIns = await CheckInModel.find({ business_id: { $in: businessIds } }).select('_id');
    const checkInIds = checkIns.map(ci => ci._id);

    // Delete notifications (related to cases/businesses)
    const deletedNotifications = await NotificationModel.deleteMany({
      $or: [
        { entityType: 'case' },
        { entityType: 'business' },
        { 'metadata.businessId': { $in: businessIds } },
      ],
    });
    console.log(`✅ Deleted ${deletedNotifications.deletedCount} notifications`);

    // Delete tasks (related to businesses/cases)
    const deletedTasks = await TaskModel.deleteMany({
      $or: [
        { business_id: { $in: businessIds } },
        { case_id: { $exists: true } }, // All tasks with case_id
      ],
    });
    console.log(`✅ Deleted ${deletedTasks.deletedCount} tasks`);

    // Delete duplicate reviews
    const deletedDuplicateReviews = await DuplicateReviewModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedDuplicateReviews.deletedCount} duplicate reviews`);

    // Delete edit requests
    const deletedEditRequests = await EditRequestModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedEditRequests.deletedCount} edit requests`);

    // Delete evidence (related to cases)
    const deletedEvidence = await EvidenceModel.deleteMany({
      case_id: { $exists: true }, // All evidence with case_id
    });
    console.log(`✅ Deleted ${deletedEvidence.deletedCount} evidence files`);

    // Delete payments (related to cases)
    const deletedPayments = await PaymentModel.deleteMany({
      case_id: { $exists: true }, // All payments with case_id
    });
    console.log(`✅ Deleted ${deletedPayments.deletedCount} payments`);

    // Delete cases
    const deletedCases = await CaseModel.deleteMany({
      check_in_id: { $in: checkInIds },
    });
    console.log(`✅ Deleted ${deletedCases.deletedCount} cases`);

    // Delete check-ins
    const deletedCheckIns = await CheckInModel.deleteMany({
      business_id: { $in: businessIds },
    });
    console.log(`✅ Deleted ${deletedCheckIns.deletedCount} check-ins`);

    // Delete businesses
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
deleteAllBusinesses();
