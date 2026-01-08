import { BusinessModel } from '../models/business.js';

/**
 * Generate a unique Registration Number
 * Format: REG-YYYYMMDD-XXXX (where XXXX is a 4-digit sequential number)
 */
export const generateRegistrationNumber = async () => {
  const today = new Date();
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const baseRegNumber = `REG-${datePrefix}`;
  
  // Find the highest sequential number for today
  const existingRegNumbers = await BusinessModel.find({
    registration_number: { $regex: `^${baseRegNumber}-` },
  }).sort({ registration_number: -1 }).limit(1);
  
  let sequence = 1;
  if (existingRegNumbers.length > 0 && existingRegNumbers[0].registration_number) {
    const lastSequence = parseInt(existingRegNumbers[0].registration_number.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }
  
  const regNumber = `${baseRegNumber}-${String(sequence).padStart(4, '0')}`;
  
  // Ensure uniqueness (double-check)
  const exists = await BusinessModel.findOne({ registration_number: regNumber });
  if (exists) {
    // If somehow it exists, increment sequence
    return `${baseRegNumber}-${String(sequence + 1).padStart(4, '0')}`;
  }
  
  return regNumber;
};

