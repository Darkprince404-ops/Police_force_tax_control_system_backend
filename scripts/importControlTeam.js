/**
 * Script to import CONRTOROL TEAM.xlsx directly into the database
 * Run with: node scripts/importControlTeam.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

import { BusinessModel, CheckInModel, CaseModel } from '../src/models/index.js';
import { generateBusinessId } from '../src/utils/businessId.js';
import { generateCaseNumber } from '../src/utils/caseNumber.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BATCH_SIZE = 50;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Parse Excel file
const parseExcel = (filePath) => {
  console.log('📂 Reading file:', filePath);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const headers = data[0];
  const rows = data.slice(1).filter(row => row && row.length > 0 && row.some(cell => cell));
  
  console.log('📊 Headers:', headers);
  console.log('📊 Total rows:', rows.length);
  
  return { headers, rows };
};

// Extract case type from case field
const extractCaseType = (caseValue) => {
  if (!caseValue) return { type: 'OTHER', description: '' };
  const caseStr = String(caseValue).trim();
  const upperCaseStr = caseStr.toUpperCase();
  if (upperCaseStr.includes('TCC')) return { type: 'TCC', description: caseStr };
  if (upperCaseStr.includes('EVC')) return { type: 'EVC', description: caseStr };
  return { type: 'OTHER', description: caseStr };
};

// Main import function
const importData = async () => {
  await connectDB();
  
  const filePath = path.join(__dirname, '..', '..', 'CONRTOROL TEAM.xlsx');
  const { headers, rows } = parseExcel(filePath);
  
  // Map headers to indices
  const getColIndex = (names) => {
    for (const name of names) {
      const idx = headers.findIndex(h => String(h).toLowerCase().trim() === name.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };
  
  const colMap = {
    owner_name: getColIndex(['MAGACA SHAQSIGA', 'magaca shaqsiga']),
    title: getColIndex(['TITLE', 'title']),
    phone: getColIndex(['NUMBER', 'number']),
    district: getColIndex(['DEGMADA', 'degmada']),
    department: getColIndex(['WAAXDA', 'waaxda']),
    business_name: getColIndex(['MAGACA GANACSIGA', 'magaca ganacsiga']),
    account: getColIndex(['ACCOUN-KA', 'accoun-ka', 'ACCOUNT KA', 'account ka']),
    case_field: getColIndex(['KIISKA', 'kiiska', 'case']),
  };
  
  console.log('📍 Column mapping:', colMap);
  
  const summary = {
    total: rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    checkIns: 0,
    cases: 0,
  };
  
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, rows.length);
    const batchRows = rows.slice(startIdx, endIdx);
    
    console.log(`\n🔄 Processing batch ${batchNum + 1}/${totalBatches} (rows ${startIdx + 1}-${endIdx})`);
    
    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      const rowNum = startIdx + i + 2; // Excel row number (1-indexed + header)
      
      try {
        const getValue = (colIdx) => colIdx >= 0 ? row[colIdx] : undefined;
        
        const businessName = String(getValue(colMap.business_name) || '').trim();
        if (!businessName) {
          summary.skipped++;
          continue;
        }
        
        // Build owner name with title
        let ownerName = String(getValue(colMap.owner_name) || '').trim();
        const title = String(getValue(colMap.title) || '').trim();
        if (title && ownerName) {
          ownerName = `${title}: ${ownerName}`;
        }
        
        const district = String(getValue(colMap.district) || '').trim();
        const department = String(getValue(colMap.department) || '').trim();
        const phone = getValue(colMap.phone);
        const accountValue = getValue(colMap.account);
        const caseValue = getValue(colMap.case_field);
        
        // Check for duplicate
        const existing = await BusinessModel.findOne({
          business_name: new RegExp(`^${businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
        
        if (existing) {
          summary.skipped++;
          continue;
        }
        
        // Create business
        const business = await BusinessModel.create({
          business_id: await generateBusinessId(),
          business_name: businessName,
          owner_name: ownerName || undefined,
          contact_phone: phone ? String(phone) : undefined,
          address: district || undefined,
          district: district || undefined,
          business_type: department || undefined,
        });
        
        summary.created++;
        
        // Create check-in if we have case or account info
        if (caseValue || accountValue) {
          const checkInData = {
            business_id: business.id,
            check_in_date: new Date(),
            notes: 'Imported from Control Team Excel',
          };
          
          // Parse fine amount
          if (accountValue) {
            const fineValue = typeof accountValue === 'string'
              ? parseFloat(accountValue.replace(/[^0-9.]/g, ''))
              : parseFloat(accountValue);
            if (!isNaN(fineValue) && fineValue > 0) {
              checkInData.fine = fineValue;
            }
          }
          
          const checkIn = await CheckInModel.create(checkInData);
          summary.checkIns++;
          
          // Create case if we have case info
          if (caseValue) {
            const { type: caseType, description } = extractCaseType(caseValue);
            const caseNumber = generateCaseNumber(new Date(), summary.cases + 1);
            
            await CaseModel.create({
              check_in_id: checkIn.id,
              case_type: caseType,
              case_number: caseNumber,
              description: description,
              status: 'UnderAssessment',
            });
            summary.cases++;
          }
        }
        
      } catch (err) {
        console.error(`❌ Row ${rowNum} failed:`, err.message);
        summary.failed++;
      }
    }
    
    const progress = Math.round((endIdx / rows.length) * 100);
    console.log(`✅ Batch complete. Progress: ${progress}% | Created: ${summary.created} | Skipped: ${summary.skipped} | Failed: ${summary.failed}`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total rows:      ${summary.total}`);
  console.log(`Created:         ${summary.created}`);
  console.log(`Skipped (dupe):  ${summary.skipped}`);
  console.log(`Failed:          ${summary.failed}`);
  console.log(`Check-ins:       ${summary.checkIns}`);
  console.log(`Cases:           ${summary.cases}`);
  console.log('='.repeat(50));
  
  await mongoose.disconnect();
  console.log('\n✅ Import complete! Disconnected from MongoDB.');
};

// Run the import
importData().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

