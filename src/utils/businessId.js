import { BusinessModel } from '../models/business.js';

export const generateBusinessId = async () => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = 'BIZ';

  const todayPattern = new RegExp(`^${prefix}-${dateStr}-`);
  const todayBusinesses = await BusinessModel.find({
    business_id: todayPattern,
  })
    .sort({ business_id: -1 })
    .limit(1);

  let counter = 1;
  if (todayBusinesses.length > 0 && todayBusinesses[0].business_id) {
    const lastId = todayBusinesses[0].business_id;
    const parts = lastId.split('-');
    if (parts.length === 3) {
      const lastCounter = parseInt(parts[2] || '0', 10);
      counter = lastCounter + 1;
    }
  }

  const counterStr = counter.toString().padStart(4, '0');
  return `${prefix}-${dateStr}-${counterStr}`;
};

