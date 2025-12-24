import { BusinessModel } from '../models/business.js';

/**
 * Generate a unique Tax ID
 * Format: TAX-YYYYMMDD-XXXX (where XXXX is a 4-digit sequential number)
 */
export const generateTaxId = async () => {
  const today = new Date();
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const baseTaxId = `TAX-${datePrefix}`;
  
  // Find the highest sequential number for today
  const existingTaxIds = await BusinessModel.find({
    tax_id: { $regex: `^${baseTaxId}-` },
  }).sort({ tax_id: -1 }).limit(1);
  
  let sequence = 1;
  if (existingTaxIds.length > 0 && existingTaxIds[0].tax_id) {
    const lastSequence = parseInt(existingTaxIds[0].tax_id.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }
  
  const taxId = `${baseTaxId}-${String(sequence).padStart(4, '0')}`;
  
  // Ensure uniqueness (double-check)
  const exists = await BusinessModel.findOne({ tax_id: taxId });
  if (exists) {
    // If somehow it exists, increment sequence
    return `${baseTaxId}-${String(sequence + 1).padStart(4, '0')}`;
  }
  
  return taxId;
};

