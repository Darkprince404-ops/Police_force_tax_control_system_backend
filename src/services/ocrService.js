import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Extract text from PDF file
 */
const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extract dates from text using common date patterns
 * Returns array of found dates
 */
const extractDatesFromText = (text) => {
  const dates = [];
  
  // Common date patterns
  const patterns = [
    // DD/MM/YYYY or MM/DD/YYYY
    /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g,
    // YYYY-MM-DD
    /\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/g,
    // DD Month YYYY or Month DD, YYYY
    /\b(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4})\b/gi,
    /\b((January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{2,4})\b/gi,
  ];
  
  patterns.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      try {
        const dateStr = match[1];
        const date = new Date(dateStr);
        // Only accept valid dates and dates in the future (for comeback dates)
        // or dates within reasonable range (past 5 years to future 2 years)
        const now = new Date();
        const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);
        const twoYearsFromNow = new Date(now.getFullYear() + 2, 11, 31);
        
        if (date instanceof Date && !isNaN(date.getTime()) && date >= fiveYearsAgo && date <= twoYearsFromNow) {
          dates.push(date);
        }
      } catch (e) {
        // Skip invalid dates
      }
    }
  });
  
  return dates;
};

/**
 * Extract the most likely date from a document
 * For comeback dates, prefer future dates
 */
const extractMostLikelyDate = (dates) => {
  if (dates.length === 0) return null;
  
  const now = new Date();
  
  // Prefer future dates (for comeback dates)
  const futureDates = dates.filter((d) => d > now);
  if (futureDates.length > 0) {
    // Return the closest future date
    return futureDates.sort((a, b) => a - b)[0];
  }
  
  // Otherwise, return the most recent date
  return dates.sort((a, b) => b - a)[0];
};

/**
 * Extract date from uploaded file
 * @param {string} filePath - Path to the uploaded file
 * @param {string} mimeType - MIME type of the file
 * @returns {Date|null} - Extracted date or null if not found
 */
export const extractDateFromFile = async (filePath, mimeType) => {
  try {
    let text = '';
    
    if (mimeType === 'application/pdf') {
      // Extract text from PDF
      text = await extractTextFromPDF(filePath);
    } else if (mimeType.startsWith('image/')) {
      // For images, we'll need OCR but for now return null
      // In a production system, you'd use Tesseract.js or similar
      // For MVP, we'll require manual date entry for images
      return null;
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
    
    if (!text || text.trim().length === 0) {
      return null;
    }
    
    // Extract dates from text
    const dates = extractDatesFromText(text);
    
    if (dates.length === 0) {
      return null;
    }
    
    // Return the most likely date
    return extractMostLikelyDate(dates);
  } catch (error) {
    console.error('Error extracting date from file:', error);
    return null;
  }
};

