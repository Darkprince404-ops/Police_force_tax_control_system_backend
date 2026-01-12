import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { CaseModel } from '../src/models/case.js';
import { config } from '../src/config.js';

const migratePaymentStatus = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected for payment status migration.');

    const cases = await CaseModel.find({});
    let updatedCount = 0;

    for (const caseItem of cases) {
      let needsSave = false;

      // Set payment_status if not present
      if (!caseItem.payment_status) {
        // If status is NotGuilty, set to not_applicable
        if (caseItem.status === 'NotGuilty') {
          caseItem.payment_status = 'not_applicable';
          needsSave = true;
        }
        // If fine_amount > 0, set to unpaid
        else if (caseItem.fine_amount && caseItem.fine_amount > 0) {
          caseItem.payment_status = 'unpaid';
          needsSave = true;
        }
        // Otherwise, default to unpaid
        else {
          caseItem.payment_status = 'unpaid';
          needsSave = true;
        }
      }

      if (needsSave) {
        await caseItem.save();
        updatedCount++;
      }
    }

    console.log(`✅ Migration complete. Updated ${updatedCount} cases.`);
    console.log(`   - Payment status set based on case status and fine amount`);
  } catch (error) {
    console.error('❌ Error during payment status migration:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected.');
  }
};

migratePaymentStatus();
