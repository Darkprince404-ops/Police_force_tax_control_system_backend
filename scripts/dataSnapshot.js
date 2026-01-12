import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { config } from '../src/config.js';
import { CaseModel } from '../src/models/case.js';
import { UserModel } from '../src/models/user.js';
import { BusinessModel } from '../src/models/business.js';
import { CheckInModel } from '../src/models/checkIn.js';

dotenv.config();

const snapshot = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected\n');

    console.log('=== DATA REALITY SNAPSHOT ===\n');

    // Case Statuses
    const caseStatuses = await CaseModel.distinct('status');
    console.log('Case Statuses (distinct):');
    console.log(JSON.stringify(caseStatuses, null, 2));
    console.log(`Total: ${caseStatuses.length}\n`);

    // Case Types
    const caseTypes = await CaseModel.distinct('case_type');
    console.log('Case Types (distinct):');
    console.log(JSON.stringify(caseTypes, null, 2));
    console.log(`Total: ${caseTypes.length}\n`);

    // Case Results
    const caseResults = await CaseModel.distinct('result');
    console.log('Case Results (distinct):');
    console.log(JSON.stringify(caseResults.filter(r => r !== null), null, 2));
    console.log(`Total: ${caseResults.filter(r => r !== null).length}\n`);

    // User Roles
    const userRoles = await UserModel.distinct('role');
    console.log('User Roles (distinct):');
    console.log(JSON.stringify(userRoles, null, 2));
    console.log(`Total: ${userRoles.length}\n`);

    // User Statuses
    const userStatuses = await UserModel.distinct('status');
    console.log('User Statuses (distinct):');
    console.log(JSON.stringify(userStatuses, null, 2));
    console.log(`Total: ${userStatuses.length}\n`);

    // Counts
    const caseCount = await CaseModel.countDocuments();
    const userCount = await UserModel.countDocuments();
    const businessCount = await BusinessModel.countDocuments();
    const checkInCount = await CheckInModel.countDocuments();

    console.log('=== DOCUMENT COUNTS ===');
    console.log(`Cases: ${caseCount}`);
    console.log(`Users: ${userCount}`);
    console.log(`Businesses: ${businessCount}`);
    console.log(`Check-ins: ${checkInCount}\n`);

    // Status distribution for cases
    const statusDistribution = await CaseModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('=== CASE STATUS DISTRIBUTION ===');
    statusDistribution.forEach(item => {
      console.log(`${item._id || '(null)'}: ${item.count}`);
    });
    console.log();

    // Case type distribution
    const typeDistribution = await CaseModel.aggregate([
      {
        $group: {
          _id: '$case_type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('=== CASE TYPE DISTRIBUTION ===');
    typeDistribution.forEach(item => {
      console.log(`${item._id || '(null)'}: ${item.count}`);
    });
    console.log();

    // Role distribution
    const roleDistribution = await UserModel.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('=== USER ROLE DISTRIBUTION ===');
    roleDistribution.forEach(item => {
      console.log(`${item._id || '(null)'}: ${item.count}`);
    });
    console.log();

    console.log('=== SNAPSHOT COMPLETE ===');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error generating snapshot:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

snapshot();
