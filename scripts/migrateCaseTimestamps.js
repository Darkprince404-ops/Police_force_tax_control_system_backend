import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { config } from '../src/config.js';
import { CaseModel } from '../src/models/case.js';

dotenv.config();

const migrateTimestamps = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected\n');

    console.log('Starting timestamp migration...\n');

    // Get all cases
    const cases = await CaseModel.find({});
    console.log(`Found ${cases.length} cases to migrate\n`);

    let updated = 0;
    let resolvedCount = 0;

    for (const caseItem of cases) {
      let needsUpdate = false;
      const updates = {};

      // Set lastActivityAt to updatedAt if not set
      if (!caseItem.lastActivityAt) {
        updates.lastActivityAt = caseItem.updatedAt || caseItem.createdAt || new Date();
        needsUpdate = true;
      }

      // Set resolvedAt if status is Resolved and resolvedAt is not set
      if (caseItem.status === 'Resolved' && !caseItem.resolvedAt) {
        updates.resolvedAt = caseItem.updatedAt || caseItem.createdAt || new Date();
        needsUpdate = true;
        resolvedCount++;
      }

      if (needsUpdate) {
        await CaseModel.findByIdAndUpdate(caseItem._id, updates);
        updated++;
      }
    }

    console.log('=== MIGRATION COMPLETE ===');
    console.log(`Total cases processed: ${cases.length}`);
    console.log(`Cases updated: ${updated}`);
    console.log(`Resolved cases found: ${resolvedCount}`);
    console.log('\nMigration successful!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

migrateTimestamps();
