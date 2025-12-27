import fs from 'fs';

import mongoose from 'mongoose';
import xlsx from 'xlsx';

import { BusinessModel, CaseModel, CheckInModel, ImportJobModel } from '../models/index.js';
import { generateCaseNumber } from '../utils/caseNumber.js';
import { generateBusinessId } from '../utils/businessId.js';

const normalize = (val) => (val || '').trim().toLowerCase();

// Normalize header for case-insensitive matching
const normalizeHeader = (header) => String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Header variations mapping - all variations map to field names
const headerVariations = {
  owner_name: [
    'magaca shaqsiga', 'magaca shaqoiga', 'magaca shaqsiga', 
    'name of incharge', 'name of owner', 'the name of the incharge or the owner',
    'owner name', 'owner', 'incharge', 'name of the owner', 'name of the incharge'
  ],
  business_name: [
    'magaca ganacsiga', 'business name', 'ganacsiga', 'business', 'company name', 'company'
  ],
  tax_id: [
    'xiiska', 'tax id', 'tax_id', 'tax number', 'tin'
  ],
  fined_amount: [
    'account', 'account ka', 'fine', 'fined amount', 'fined_amount', 'amount', 'penalty'
  ],
  contact_phone: [
    'number', 'their number', 'phone', 'contact number', 'contact_phone', 'telephone', 'mobile', 'phone number'
  ],
  district: [
    'district', 'degmada', 'area', 'region'
  ],
  department: [
    'department', 'waaxda', 'dept', 'section'
  ],
  title: [
    'title', 'position', 'role'
  ],
  case_field: [
    'case', 'case type', 'case_type', 'case description', 'violation', 'offense'
  ],
  case_date: [
    'date this case was registered', 'case date', 'registration date', 'date registered',
    'date', 'registered date', 'case registration date'
  ],
  address: [
    'address', 'location', 'place'
  ],
  contact_email: [
    'email', 'contact email', 'contact_email', 'e-mail'
  ],
};

// Auto-detect headers and map them to English field names (case-insensitive)
const autoDetectMapping = (headers) => {
  const mapping = {};
  
  headers.forEach((header) => {
    const originalHeader = String(header).trim();
    const normalizedHeader = normalizeHeader(header);
    
    // Check each field's variations
    for (const [fieldName, variations] of Object.entries(headerVariations)) {
      if (variations.some(v => normalizeHeader(v) === normalizedHeader)) {
        mapping[fieldName] = originalHeader;
        break;
      }
    }
  });

  return mapping;
};

const parseFile = (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // xlsx library can handle both CSV and Excel files with readFile
    let workbook;
    const ext = filePath.toLowerCase().split('.').pop();
    
    try {
      // Try reading as Excel file first
      workbook = xlsx.readFile(filePath, { cellDates: false, cellNF: false, cellText: false });
    } catch (readError) {
      console.error('xlsx.readFile error:', readError);
      console.error('Error message:', readError.message);
      console.error('Error code:', readError.code);
      
      // Check if it's a password-protected file error
      const errorMsg = (readError.message || '').toLowerCase();
      const errorStack = (readError.stack || '').toLowerCase();
      
      if (
        errorMsg.includes('password') ||
        errorMsg.includes('encrypted') ||
        errorMsg.includes('protected') ||
        errorStack.includes('password') ||
        errorStack.includes('encrypted') ||
        readError.message?.includes('Cannot read') ||
        readError.message?.includes('bad password') ||
        readError.message?.includes('encrypted')
      ) {
        throw new Error(
          'This Excel file is password-protected. Please remove the password protection before uploading. ' +
          'To remove password: Open the file in Excel → File → Info → Protect Workbook → Remove password, then save and upload again.'
        );
      }
      
      // If readFile fails, try reading CSV as text
      if (ext === 'csv') {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          workbook = xlsx.read(content, { type: 'string' });
        } catch (csvError) {
          console.error('CSV read error:', csvError);
          throw new Error(
            `Cannot read CSV file. The file may be corrupted or in an unsupported format. ` +
            `Error: ${csvError.message}`
          );
        }
      } else {
        // Provide more helpful error message for Excel files
        const errorDetails = readError.message || 'Unknown error';
        throw new Error(
          `Cannot read Excel file. The file may be password-protected, corrupted, or in an unsupported format. ` +
          `Please ensure the file is not password-protected and is a valid .xlsx or .xls file. ` +
          `Error: ${errorDetails}`
        );
      }
    }
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in file. The file may be password-protected or empty.');
    }
    
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new Error('Sheet is empty or invalid. The file may be password-protected.');
    }
    
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    if (!rows || rows.length === 0) {
      throw new Error('File contains no data');
    }
    
    return rows;
  } catch (error) {
    console.error('Error parsing file:', error);
    console.error('File path:', filePath);
    console.error('Error stack:', error.stack);
    
    // If it's already our custom error, throw it as-is
    if (error.message.includes('password-protected') || error.message.includes('Cannot read file')) {
      throw error;
    }
    
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

export const parsePreview = (filePath) => {
  try {
    if (!filePath) {
      throw new Error('File path is required');
    }

    const rows = parseFile(filePath);
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error('File is empty or could not be parsed. Please check the file format.');
    }

    // Get headers from first row
    const firstRow = rows[0] || [];
    const headers = firstRow
      .map((h) => {
        const header = String(h || '').trim();
        return header;
      })
      .filter(h => h !== '' && h !== null && h !== undefined);
    
    if (headers.length === 0) {
      throw new Error('No headers found in file. Please ensure the first row contains column names.');
    }

    // Create sample rows (first 20 data rows)
    const dataRows = rows.slice(1, 21)
      .filter(row => row && Array.isArray(row))
      .map((row) => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx] ?? '';
        });
        return obj;
      });
    
    // Auto-detect mapping
    const autoMapping = autoDetectMapping(headers);
    
    // Get all rows for preview (not just first 20)
    const allRows = rows.slice(1)
      .filter(row => row && Array.isArray(row))
      .map((row) => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx] ?? '';
        });
        return obj;
      })
      .filter(row => {
        // Filter out completely empty rows
        return Object.values(row).some(val => {
          const valStr = String(val || '').trim();
          return valStr !== '' && valStr !== 'null' && valStr !== 'undefined';
        });
      });
    
    return { 
      headers, 
      sampleRows: dataRows,
      allRows: allRows.slice(0, 50), // First 50 rows for preview
      autoMapping,
      totalRows: allRows.length,
    };
  } catch (error) {
    console.error('Error in parsePreview:', error);
    console.error('File path:', filePath);
    console.error('Error stack:', error.stack);
    
    // Re-throw with a user-friendly message if it's not already an Error object
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to parse preview: ${String(error)}`);
  }
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

// Extract case type from case field value
const extractCaseType = (caseValue) => {
  if (!caseValue) return { type: 'OTHER', description: '' };
  
  const caseStr = String(caseValue).trim();
  const upperCaseStr = caseStr.toUpperCase();
  
  // Check for known case types
  if (upperCaseStr.includes('TCC')) return { type: 'TCC', description: caseStr };
  if (upperCaseStr.includes('EVC')) return { type: 'EVC', description: caseStr };
  
  // Default to OTHER with the full value as description
  return { type: 'OTHER', description: caseStr };
};

// Parse date from various formats
const parseDate = (dateValue) => {
  if (!dateValue) return null;
  
  // If already a Date object
  if (dateValue instanceof Date) return dateValue;
  
  // Try parsing string date
  const dateStr = String(dateValue).trim();
  if (!dateStr) return null;
  
  // Try standard parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
        
        // Handle title - prepend to owner_name if available
        let ownerName = toObj('owner_name');
        const title = toObj('title');
        if (title && ownerName) {
          ownerName = `${String(title).trim()}: ${String(ownerName).trim()}`;
        } else if (title && !ownerName) {
          ownerName = String(title).trim();
        }
        
        const businessPayload = {
          business_name: String(toObj('business_name') || '').trim(),
          owner_name: ownerName,
          address: address,
          contact_phone: toObj('contact_phone'),
          contact_email: toObj('contact_email'),
          business_type: toObj('business_type') || toObj('department'), // Use department as business_type if available
          tax_id: toObj('tax_id'),
          registration_number: toObj('registration_number'),
          district: district,
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

        // Get case date - use for both check-in and case
        const caseDateRaw = toObj('case_date');
        const checkInDateRaw = toObj('check_in_date') || caseDateRaw;
        const finedAmountRaw = toObj('fined_amount');
        const caseFieldRaw = toObj('case_field');
        
        // Parse dates
        const checkInDate = parseDate(checkInDateRaw) || new Date();
        
        // Determine if we should create check-in and case
        const hasFinedAmount = finedAmountRaw !== undefined && finedAmountRaw !== null && finedAmountRaw !== '';
        const hasCaseField = caseFieldRaw !== undefined && caseFieldRaw !== null && caseFieldRaw !== '';
        const hasCaseDate = caseDateRaw !== undefined && caseDateRaw !== null && caseDateRaw !== '';
        
        let checkInId;
        // Create check-in if we have date, fined amount, or case field
        if (checkInDateRaw || hasFinedAmount || hasCaseField || hasCaseDate) {
          const checkInData = {
            business_id: businessId,
            officer_id: userId,
            notes: 'Imported',
            check_in_date: checkInDate,
          };
          
          // Parse fined amount - handle string numbers
          if (hasFinedAmount) {
            const fineValue = typeof finedAmountRaw === 'string' 
              ? parseFloat(String(finedAmountRaw).replace(/[^0-9.]/g, '')) 
              : parseFloat(finedAmountRaw);
            if (!isNaN(fineValue) && fineValue > 0) {
              checkInData.fine = fineValue;
            }
          }
          
          const check = await CheckInModel.create([checkInData], { session });
          checkInId = check[0].id;
          summary.createdCheckIns += 1;
        }

        // Handle case field - extract type and description
        if (hasCaseField && checkInId) {
          const { type: caseType, description: caseDescription } = extractCaseType(caseFieldRaw);
          const case_number = generateCaseNumber(checkInDate, summary.createdCases + 1);
          
          const caseData = {
            check_in_id: checkInId,
            case_type: caseType,
            case_number,
            description: caseDescription,
            status: 'UnderAssessment',
            assigned_officer_id: userId,
          };
          
          // Add fine amount to case if available
          if (hasFinedAmount) {
            const fineValue = typeof finedAmountRaw === 'string' 
              ? parseFloat(String(finedAmountRaw).replace(/[^0-9.]/g, '')) 
              : parseFloat(finedAmountRaw);
            if (!isNaN(fineValue) && fineValue > 0) {
              caseData.fine_amount = fineValue;
            }
          }
          
          await CaseModel.create([caseData], { session });
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

