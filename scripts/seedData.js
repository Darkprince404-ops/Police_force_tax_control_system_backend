import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { UserModel, BusinessModel, CaseModel, CheckInModel } from '../src/models/index.js';
import { generateBusinessId } from '../src/utils/businessId.js';
import { generateTaxId } from '../src/utils/taxId.js';
import { generateRegistrationNumber } from '../src/utils/registrationNumber.js';
import { nextCaseNumber } from '../src/services/caseService.js';

dotenv.config();

// Somali common names
const somaliNames = {
  male: ['Ahmed', 'Mohamed', 'Hassan', 'Abdi', 'Omar', 'Ali', 'Ibrahim', 'Abdullahi', 'Abdifatah', 'Khalid'],
  female: ['Amina', 'Fadumo', 'Sahra', 'Khadija', 'Zahra', 'Maryam', 'Halima', 'Aisha', 'Fatima', 'Kaltun'],
};

// Somali business names
const businessNames = [
  { name: 'Macmac Dukaan', type: 'Retail Store', owner: 'Ahmed Hassan' },
  { name: 'Suuq Hargeisa', type: 'Market Stall', owner: 'Amina Abdi' },
  { name: 'Bukaanka Barwaaqo', type: 'Restaurant', owner: 'Mohamed Ali' },
  { name: 'Guriga Cadarka', type: 'Clothing Store', owner: 'Khadija Omar' },
  { name: 'Shaxda Gaadiidka', type: 'Auto Shop', owner: 'Ibrahim Abdullahi' },
  { name: 'Dukaanka Qaaliga', type: 'Jewelry Store', owner: 'Halima Hassan' },
  { name: 'Maxaabiista Fudud', type: 'Fast Food', owner: 'Abdi Mohamed' },
  { name: 'Dukaanka Agabka', type: 'Hardware Store', owner: 'Omar Ibrahim' },
  { name: 'Guriga Nadaafada', type: 'Cleaners', owner: 'Zahra Abdi' },
  { name: 'Kaafiyada Dhakhtar', type: 'Pharmacy', owner: 'Fatima Hassan' },
  { name: 'Suuq Kaluunka', type: 'Fish Market', owner: 'Abdullahi Ali' },
  { name: 'Dukaanka Buugaagta', type: 'Bookstore', owner: 'Aisha Mohamed' },
  { name: 'Warshadda Cuntada', type: 'Food Processing', owner: 'Khalid Omar' },
  { name: 'Dukaanka Qoriya', type: 'Money Transfer', owner: 'Maryam Hassan' },
  { name: 'Guriga Timaha', type: 'Hair Salon', owner: 'Abdifatah Abdi' },
];

const caseTypes = ['TCC', 'EVC', 'OTHER'];
const caseStatuses = ['UnderAssessment', 'Guilty', 'Fined', 'PendingComeback', 'Resolved', 'Escalated'];
const fines = [50, 75, 100, 150, 200, 250, 300, 400, 500];

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/police-tax-control';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');

    // Create users with Somali names
    const users = [];
    const somaliOfficerNames = ['Mohamed Ali', 'Hassan Abdi', 'Ibrahim Omar', 'Abdullahi Hassan', 'Abdi Mohamed'];
    const somaliSupervisorNames = ['Ahmed Hassan', 'Omar Ibrahim'];

    for (let i = 0; i < somaliOfficerNames.length; i++) {
      const email = `officer${i + 1}@taxcontrol.so`;
      const existing = await UserModel.findOne({ email });
      if (!existing) {
        const passwordHash = await bcrypt.hash('Officer123!', 10);
        const user = await UserModel.create({
          email,
          name: somaliOfficerNames[i],
          passwordHash,
          role: 'officer',
        });
        users.push(user);
        console.log(`✅ Created officer: ${user.name} (${user.email})`);
      } else {
        users.push(existing);
        console.log(`⚠️  Officer already exists: ${existing.name}`);
      }
    }

    for (let i = 0; i < somaliSupervisorNames.length; i++) {
      const email = `supervisor${i + 1}@taxcontrol.so`;
      const existing = await UserModel.findOne({ email });
      if (!existing) {
        const passwordHash = await bcrypt.hash('Supervisor123!', 10);
        const user = await UserModel.create({
          email,
          name: somaliSupervisorNames[i],
          passwordHash,
          role: 'supervisor',
        });
        users.push(user);
        console.log(`✅ Created supervisor: ${user.name} (${user.email})`);
      } else {
        users.push(existing);
        console.log(`⚠️  Supervisor already exists: ${existing.name}`);
      }
    }

    // Create businesses with Somali names
    const businesses = [];
    console.log('\n📦 Creating businesses...');
    
    for (const biz of businessNames) {
      // Check if business already exists
      const existing = await BusinessModel.findOne({ business_name: biz.name });
      if (existing) {
        businesses.push(existing);
        console.log(`⚠️  Business already exists: ${biz.name}`);
        continue;
      }
      
      const businessId = await generateBusinessId();
      const taxId = await generateTaxId();
      const regNumber = await generateRegistrationNumber();
      
      const business = await BusinessModel.create({
        business_id: businessId,
        business_name: biz.name,
        owner_name: biz.owner,
        address: 'Hargeisa, Somaliland',
        contact_phone: `+252${Math.floor(1000000 + Math.random() * 9000000)}`,
        business_type: biz.type,
        tax_id: taxId,
        registration_number: regNumber,
      });
      businesses.push(business);
      console.log(`✅ Created business: ${biz.name} (Owner: ${biz.owner})`);
    }

    // Create cases with fines
    console.log('\n📋 Creating cases with fines...');
    
    let dayOffset = 0;
    for (let i = 0; i < businesses.length; i++) {
      const business = businesses[i];
      const numCases = Math.floor(Math.random() * 3) + 1; // 1-3 cases per business
      
      for (let j = 0; j < numCases; j++) {
        // Use unique dates (one per case) to avoid duplicate case numbers
        const caseDate = new Date();
        caseDate.setDate(caseDate.getDate() - dayOffset); // Use sequential days to ensure uniqueness
        caseDate.setHours(0, 0, 0, 0);
        dayOffset++;
        const caseNumber = await nextCaseNumber(caseDate);
        
        // Create check-in first (cases need check_in_id)
        const checkInDate = new Date(caseDate);
        checkInDate.setHours(8 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
        
        const fine = fines[Math.floor(Math.random() * fines.length)];
        const checkIn = await CheckInModel.create({
          business_id: business._id,
          officer_id: users[Math.floor(Math.random() * somaliOfficerNames.length)]._id,
          check_in_date: checkInDate,
          phone: `+252${Math.floor(1000000 + Math.random() * 9000000)}`,
          fine: fine,
          notes: 'Tax compliance check',
        });

        const caseType = caseTypes[Math.floor(Math.random() * caseTypes.length)];
        const status = caseStatuses[Math.floor(Math.random() * caseStatuses.length)];
        
        const caseDoc = await CaseModel.create({
          check_in_id: checkIn._id,
          case_number: caseNumber,
          case_type: caseType,
          status: status,
          description: `Tax violation case for ${business.business_name}`,
          assigned_officer_id: users[Math.floor(Math.random() * somaliOfficerNames.length)]._id,
        });
        
        console.log(`✅ Created case ${caseNumber} for ${business.business_name} - Fine: $${fine}`);
      }
    }

    console.log('\n✅ Seed data created successfully!');
    console.log(`   - ${users.length} users created`);
    console.log(`   - ${businesses.length} businesses created`);
    console.log(`   - Cases created with fines`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedData();

