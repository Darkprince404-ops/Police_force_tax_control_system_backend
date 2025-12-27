import fs from 'fs';

import mongoose from 'mongoose';
import xlsx from 'xlsx';

import { BusinessModel, CaseModel, CheckInModel, ImportJobModel } from '../models/index.js';
import { generateCaseNumber } from '../utils/caseNumber.js';
import { generateBusinessId } from '../utils/businessId.js';

const normalize = (val) => (val || '').trim().toLowerCase();

// Auto-detect Somali headers and map them to English field names
const autoDetectMapping = (headers) => {
  const mapping = {};
  const headerMap = {
    // Somali headers → English field names
    'MAGACA SHAQOIGA': 'owner_name',
    'MAGACA GANACSIGA': 'business_name',
    'XIISKA': 'tax_id',
    'ACCOUNT KA': 'fined_amount', // Map ACCOUNT KA to fined_amount
    'NUMBER': 'contact_phone',
    'DEGMADA': 'district',
    'WAAXDA': 'department',
    'TITLE': 'title',
    // English headers (fallback)
    'business_name': 'business_name',
    'owner_name': 'owner_name',
    'tax_id': 'tax_id',
    'contact_phone': 'contact_phone',
    'address': 'address',
    'contact_email': 'contact_email',
    'fined_amount': 'fined_amount',
  };

  headers.forEach((header) => {
    const normalizedHeader = String(header).trim();
    const mappedField = headerMap[normalizedHeader];
    if (mappedField) {
      mapping[mappedField] = normalizedHeader;
    }
  });

  return mapping;
};

const parseFile = (filePath) => {
  const ext = filePath.toLowerCase().split('.').pop();
  
  if (ext === 'csv') {
    // For CSV files, read as text and parse
    const content = fs.readFileSync(filePath, 'utf-8');
    const workbook = xlsx.read(content, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1 });
  } else {
    // For Excel files
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1 });
  }
};

export const parsePreview = (filePath) => {
  const rows = parseFile(filePath);
  const headers = (rows[0] || []).map((h) => String(h).trim());
  const dataRows = rows.slice(1, 21).map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
  
  // Auto-detect mapping
  const autoMapping = autoDetectMapping(headers);
  
  // Get all rows for preview (not just first 20)
  const allRows = rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
  
  return { 
    headers, 
    sampleRows: dataRows,
    allRows: allRows.slice(0, 50), // First 50 rows for preview
    autoMapping,
    totalRows: allRows.length,
  };
};

const findDuplicateBusiness = async (taxId, name, address) => {
  if (taxId) {
    const byTax = await BusinessModel.findOne({ tax_id: taxId });
    if (byTax) return byTax;
  }
  if (name && address) {
    return BusinessModel.findOne({
      business_name: new RegExp(`^${normalize(name)}`, 'i'),
      address: new RegExp(`^${normalize(address)}`, 'i'),
    });
  }
  return null;
};

export const processImport = async (
  filePath,
  mapping,
  options,
  userId,
) => {
  const rows = parseFile(filePath);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  const summary = {
    total: dataRows.length,
    createdBusinesses: 0,
    updatedBusinesses: 0,
    createdCheckIns: 0,
    createdCases: 0,
    failed: 0,
  };
  const rowLogs = [];

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const toObj = (field) => {
        const col = mapping[field];
        if (!col) return undefined;
        const idx = headers.findIndex((h) => String(h).trim() === col);
        return idx >= 0 ? row[idx] : undefined;
      };
      try {
        // Build address from district if available
        const district = toObj('district');
        const address = toObj('address') || district || '';
        
        const businessPayload = {
          business_name: String(toObj('business_name') || '').trim(),
          owner_name: toObj('owner_name'),
          address: address,
          contact_phone: toObj('contact_phone'),
          contact_email: toObj('contact_email'),
          business_type: toObj('business_type') || toObj('department'), // Use department as business_type if available
          tax_id: toObj('tax_id'),
          registration_number: toObj('registration_number'),
        };
        if (!businessPayload.business_name) throw new Error('business_name is required');

        const duplicate = await findDuplicateBusiness(
          businessPayload.tax_id,
          businessPayload.business_name,
          businessPayload.address,
        );

        let businessId;
        if (duplicate) {
          if (options.duplicatePolicy === 'skip') {
            rowLogs.push({ rowIndex: i + 2, status: 'processed', message: 'Skipped duplicate' });
            continue;
          }
          if (options.duplicatePolicy === 'update') {
            await BusinessModel.updateOne({ _id: duplicate.id }, businessPayload, { session });
            businessId = duplicate.id;
            summary.updatedBusinesses += 1;
          } else {
            businessPayload.business_id = await generateBusinessId();
            const created = await BusinessModel.create([businessPayload], { session });
            businessId = created[0].id;
            summary.createdBusinesses += 1;
          }
        } else {
          businessPayload.business_id = await generateBusinessId();
          const created = await BusinessModel.create([businessPayload], { session });
          businessId = created[0].id;
          summary.createdBusinesses += 1;
        }

        let checkInId;
        const checkInDateRaw = toObj('check_in_date');
        const finedAmountRaw = toObj('fined_amount');
        
        // Create check-in if we have date or fined amount
        if (checkInDateRaw || finedAmountRaw) {
          const checkInData = {
            business_id: businessId,
            officer_id: userId,
            notes: 'Imported',
          };
          
          if (checkInDateRaw) {
            checkInData.check_in_date = new Date(checkInDateRaw);
          } else {
            checkInData.check_in_date = new Date(); // Use current date if not provided
          }
          
          // Parse fined amount - handle string numbers
          if (finedAmountRaw) {
            const fineValue = typeof finedAmountRaw === 'string' 
              ? parseFloat(finedAmountRaw.replace(/[^0-9.]/g, '')) 
              : parseFloat(finedAmountRaw);
            if (!isNaN(fineValue) && fineValue > 0) {
              checkInData.fine = fineValue;
            }
          }
          
          const check = await CheckInModel.create([checkInData], { session });
          checkInId = check[0].id;
          summary.createdCheckIns += 1;
        }

        const caseType = toObj('case_type');
        if (caseType) {
          const case_number = generateCaseNumber(new Date(), summary.createdCases + 1);
          await CaseModel.create(
            [
              {
                check_in_id: checkInId,
                case_type: caseType,
                case_number,
                description: toObj('case_description'),
                status: (toObj('case_status')) || 'Open',
              },
            ],
            { session },
          );
          summary.createdCases += 1;
        }

        rowLogs.push({ rowIndex: i + 2, status: 'processed' });
      } catch (err) {
        summary.failed += 1;
        rowLogs.push({ rowIndex: i + 2, status: 'failed', message: err.message });
      }
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
    fs.unlink(filePath, () => undefined);
  }

  return { summary, rowLogs };
};

