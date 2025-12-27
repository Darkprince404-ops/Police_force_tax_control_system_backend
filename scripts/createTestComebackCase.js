import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CaseModel } from '../src/models/case.js';
import { CheckInModel } from '../src/models/checkIn.js';
import { BusinessModel } from '../src/models/business.js';
import { UserModel } from '../src/models/user.js';
import { NotificationModel } from '../src/models/notification.js';
import { nextCaseNumber } from '../src/services/caseService.js';

dotenv.config();

const createTestComebackCase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get a business and officer
    const business = await BusinessModel.findOne({ business_name: 'Macmac Dukaan' });
    const officer = await UserModel.findOne({ role: 'officer' });
    const admin = await UserModel.findOne({ role: 'admin' });

    if (!business || !officer || !admin) {
      console.log('❌ Business, officer, or admin not found');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Create a check-in
    const checkIn = await CheckInModel.create({
      business_id: business._id,
      officer_id: officer._id,
      check_in_date: new Date(),
      phone: '+2521234567',
      fine: 350,
      notes: 'URGENT: Comeback case for testing notifications',
    });

    // Create comeback date 15 minutes from now
    const comebackDate = new Date();
    comebackDate.setMinutes(comebackDate.getMinutes() + 15);

    const caseNumber = await nextCaseNumber(new Date());

    const testCase = await CaseModel.create({
      check_in_id: checkIn._id,
      case_type: 'TCC',
      case_number: caseNumber,
      description: 'TEST CASE - Business owner must return for tax document verification',
      status: 'PendingComeback',
      assigned_officer_id: officer._id,
      comeback_date: comebackDate,
      comeback_notification_sent: false,
      fine_amount: 350,
    });

    // Create a notification for the admin
    await NotificationModel.create({
      user_id: admin._id,
      case_id: testCase._id,
      type: 'comeback_reminder',
      title: '⏰ Comeback Deadline Alert',
      message: `Business: ${business.business_name}\nCase: ${caseNumber}\nOwner: ${business.owner_name}\nDeadline: ${comebackDate.toLocaleString()}\n\nThe business owner is expected to return for tax document verification. Fine: $350`,
      read: false,
    });

    // Also create notification for the assigned officer
    await NotificationModel.create({
      user_id: officer._id,
      case_id: testCase._id,
      type: 'comeback_reminder',
      title: '⏰ Comeback Deadline Alert',
      message: `Business: ${business.business_name}\nCase: ${caseNumber}\nOwner: ${business.owner_name}\nDeadline: ${comebackDate.toLocaleString()}\n\nThe business owner is expected to return for tax document verification. Fine: $350`,
      read: false,
    });

    console.log('');
    console.log('✅ Test comeback case created!');
    console.log('═══════════════════════════════════════');
    console.log('   Case Number:', caseNumber);
    console.log('   Business:', business.business_name);
    console.log('   Owner:', business.owner_name);
    console.log('   Comeback Date:', comebackDate.toLocaleString());
    console.log('   Fine Amount: $350');
    console.log('   Status: PendingComeback');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('📢 Notifications created for:');
    console.log('   - Admin (admin@police.gov.so)');
    console.log('   - Officer (' + officer.email + ')');
    console.log('');
    console.log('👉 Check the bell icon 🔔 in your dashboard to see the notification!');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createTestComebackCase();
