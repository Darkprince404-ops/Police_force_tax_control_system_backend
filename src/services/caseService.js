import { CaseModel, CheckInModel } from '../models/index.js';
import { generateCaseNumber } from '../utils/caseNumber.js';

export const nextCaseNumber = async (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const count = await CaseModel.countDocuments({ createdAt: { $gte: start, $lte: end } });
  return generateCaseNumber(date, count + 1);
};

export const assertCheckInExists = async (checkInId) => {
  const exists = await CheckInModel.exists({ _id: checkInId });
  if (!exists) {
    throw new Error('Check-in not found');
  }
};

