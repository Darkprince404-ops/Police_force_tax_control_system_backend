import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { BusinessModel, CheckInModel, CaseModel, UserModel } from '../src/models/index.js';
import { nextCaseNumber } from '../src/services/caseService.js';
import { generateTaxId } from '../src/utils/taxId.js';
import { generateRegistrationNumber } from '../src/utils/registrationNumber.js';

const createTestComebackCase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control');
    console.log('✅ Connected to MongoDB');

    // Get an admin user for assignment
    const admin = await UserModel.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ No admin user found. Please create an admin user first.');
      process.exit(1);
    }

    // Get an officer user
    const officer = await UserModel.findOne({ role: 'officer' });
    if (!officer) {
      console.error('❌ No officer user found. Please create an officer user first.');
      process.exit(1);
    }

    // Create a test business
    const taxId = await generateTaxId();
    const registrationNumber = await generateRegistrationNumber();
    
    const business = await BusinessModel.create({
      business_name: 'Test Comeback Business',
      owner_name: 'Ahmed Test',
      address: 'Test Street, Mogadishu',
      contact_phone: '+252612345678',
      business_type: 'Retail Store',
      tax_id: taxId,
      registration_number: registrationNumber,
    });

    console.log(`✅ Created business: ${business.business_name} (ID: ${business._id})`);

    // Create a check-in
    const checkIn = await CheckInModel.create({
      business_id: business._id,
      officer_id: officer._id,
      check_in_date: new Date(),
      phone: '+252612345678',
      fine: 100,
      notes: 'Test check-in for comeback notification',
    });

    console.log(`✅ Created check-in (ID: ${checkIn._id})`);

    // Create a case with comeback date 15 minutes from now
    const comebackDate = new Date();
    comebackDate.setMinutes(comebackDate.getMinutes() + 15);
    
    const caseNumber = await nextCaseNumber(new Date());
    const testCase = await CaseModel.create({
      check_in_id: checkIn._id,
      case_type: 'TCC',
      case_number: caseNumber,
      description: 'Test case for comeback notification - Comeback date set to 15 minutes from now',
      status: 'PendingComeback',
      result: 'Fail',
      assigned_officer_id: officer._id,
      comeback_date: comebackDate,
      comeback_notification_sent: false,
      fine_amount: 100,
    });

    console.log(`✅ Created case: ${caseNumber}`);
    console.log(`   Status: ${testCase.status}`);
    console.log(`   Comeback Date: ${comebackDate.toLocaleString()}`);
    console.log(`   Comeback Date (ISO): ${comebackDate.toISOString()}`);
    console.log(`   Current Time: ${new Date().toLocaleString()}`);
    console.log(`   Time until comeback: ${Math.round((comebackDate - new Date()) / 1000 / 60)} minutes`);

    console.log('\n✅ Test comeback case created successfully!');
    console.log(`\n📋 Summary:`);
    console.log(`   Business: ${business.business_name}`);
    console.log(`   Business ID: ${business.business_id}`);
    console.log(`   Tax ID: ${taxId}`);
    console.log(`   Case Number: ${caseNumber}`);
    console.log(`   Comeback Date: ${comebackDate.toLocaleString()}`);
    console.log(`\n💡 Note: The notification scheduler runs every hour.`);
    console.log(`   To test immediately, you can manually trigger the notification check.`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test comeback case:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createTestComebackCase();

