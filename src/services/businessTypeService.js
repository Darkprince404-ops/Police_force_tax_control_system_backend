import { BusinessTypeModel } from '../models/businessType.js';

/**
 * Normalize business type name for consistent storage
 */
export const normalizeBusinessType = (name) => {
  return name.trim().toLowerCase();
};

/**
 * Find similar business types (for suggestions)
 */
export const findSimilarTypes = async (query) => {
  const normalizedQuery = normalizeBusinessType(query);
  
  // Text search for similar types
  const results = await BusinessTypeModel.find({
    $or: [
      { name: new RegExp(normalizedQuery, 'i') },
      { display_name: new RegExp(query, 'i') },
    ],
  })
    .sort({ usage_count: -1, display_name: 1 })
    .limit(10);

  return results.map((bt) => ({
    id: bt._id.toString(),
    _id: bt._id.toString(),
    name: bt.name,
    display_name: bt.display_name,
    usage_count: bt.usage_count,
  }));
};

/**
 * Get or create a business type
 * Returns existing normalized type or creates new one
 */
export const getOrCreateType = async (inputName) => {
  const normalizedName = normalizeBusinessType(inputName);
  
  // Try to find existing type
  let businessType = await BusinessTypeModel.findOne({ name: normalizedName });
  
  if (businessType) {
    // Increment usage count
    businessType.usage_count += 1;
    await businessType.save();
  } else {
    // Create new type
    businessType = await BusinessTypeModel.create({
      name: normalizedName,
      display_name: inputName.trim(), // Keep original casing for display
      usage_count: 1,
    });
  }
  
  return {
    id: businessType._id.toString(),
    _id: businessType._id.toString(),
    name: businessType.name,
    display_name: businessType.display_name,
    usage_count: businessType.usage_count,
  };
};

/**
 * Get all business types with usage counts
 */
export const getAllTypes = async () => {
  const types = await BusinessTypeModel.find({}).sort({ usage_count: -1, display_name: 1 });
  
  return types.map((bt) => ({
    id: bt._id.toString(),
    _id: bt._id.toString(),
    name: bt.name,
    display_name: bt.display_name,
    usage_count: bt.usage_count,
  }));
};

