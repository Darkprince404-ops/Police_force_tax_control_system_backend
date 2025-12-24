import fs from 'fs';

import mongoose from 'mongoose';
import xlsx from 'xlsx';

import { BusinessModel, CaseModel, CheckInModel, ImportJobModel } from '../models/index.js';
import { generateCaseNumber } from '../utils/caseNumber.js';
import { generateBusinessId } from '../utils/businessId.js';

const normalize = (val) => (val || '').trim().toLowerCase();

export const parsePreview = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const headers = (rows[0] || []).map((h) => String(h).trim());
  const dataRows = rows.slice(1, 21).map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
  return { headers, sampleRows: dataRows };
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
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
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
        const businessPayload = {
          business_name: String(toObj('business_name') || '').trim(),
          owner_name: toObj('owner_name'),
          address: toObj('address'),
          contact_phone: toObj('contact_phone'),
          contact_email: toObj('contact_email'),
          business_type: toObj('business_type'),
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
        if (checkInDateRaw) {
          const date = new Date(checkInDateRaw);
          const check = await CheckInModel.create(
            [
              {
                business_id: businessId,
                officer_id: userId,
                check_in_date: date,
                notes: 'Imported',
              },
            ],
            { session },
          );
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

