import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { CaseModel, BusinessModel, EvidenceModel } from '../models/index.js';

const FILE_BASE = process.env.FILE_BASE || 'http://localhost:4000';

export const generateExcelReport = async (
  reportType,
  startDate,
  endDate,
  filters = {},
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = startDate;
    if (endDate) dateFilter.createdAt.$lte = endDate;
  }
  if (filters.case_type) dateFilter.case_type = filters.case_type;
  if (filters.status) dateFilter.status = filters.status;

  switch (reportType) {
    case 'cases': {
      const cases = await CaseModel.find(dateFilter)
        .populate({
          path: 'check_in_id',
          select: 'fine business_id check_in_date phone notes',
          populate: {
            path: 'business_id',
            select: 'business_name business_type owner_name business_id tax_id',
          },
        })
        .populate('assigned_officer_id', 'name email')
        .populate('resolution_papers.officer_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      // Evidence lookup
      const caseIds = cases.map((c) => c._id);
      const evidenceList = await EvidenceModel.find({ case_id: { $in: caseIds } })
        .select('case_id file_url')
        .lean();
      const evidenceMap = {};
      evidenceList.forEach((ev) => {
        const key = ev.case_id.toString();
        if (!evidenceMap[key]) evidenceMap[key] = [];
        evidenceMap[key].push(ev);
      });

      // Header row with styling
      const headerRow = worksheet.addRow([
        'Case Number',
        'Case Type',
        'Status',
        'Description',
        'Fine Amount',
        'Business Name',
        'Business Type',
        'Owner Name',
        'Phone',
        'Check-in Date',
        'Assigned Officer',
        'Evidence URLs',
        'Created Date',
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' }, bold: true };

      // Data rows
      cases.forEach((c) => {
        const evs = evidenceMap[c._id.toString()] || [];
        const evUrls = evs.map((e) => `${FILE_BASE}${e.file_url}`).join('\n');
        worksheet.addRow([
          c.case_number || '',
          c.case_type || '',
          c.status || '',
          c.description || '',
          c.check_in_id?.fine || 0,
          c.check_in_id?.business_id?.business_name || c.check_in_id?.business_id || '',
          c.check_in_id?.business_id?.business_type || '',
          c.check_in_id?.business_id?.owner_name || '',
          c.check_in_id?.phone || '',
          c.check_in_id?.check_in_date ? new Date(c.check_in_id.check_in_date).toLocaleDateString() : '',
          c.assigned_officer_id?.name || 'Unassigned',
          evUrls,
          c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
        ]);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        column.width = column.header ? Math.max(column.header.length + 2, 15) : 15;
      });
      break;
    }
    case 'cases-summary': {
      const data = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$case_type', count: { $sum: 1 } } },
        { $project: { case_type: '$_id', count: 1, _id: 0 } },
      ]);

      const headerRow = worksheet.addRow(['Case Type', 'Count']);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' }, bold: true };

      data.forEach((row) => {
        worksheet.addRow([row.case_type, row.count]);
      });

      worksheet.columns.forEach((column) => {
        column.width = 20;
      });
      break;
    }
    case 'status-summary': {
      const data = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]);

      const headerRow = worksheet.addRow(['Status', 'Count']);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' }, bold: true };

      data.forEach((row) => {
        worksheet.addRow([row.status, row.count]);
      });

      worksheet.columns.forEach((column) => {
        column.width = 20;
      });
      break;
    }
    case 'officer-workload': {
      const data = await CaseModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$assigned_officer_id', cases: { $sum: 1 } } },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'officer',
          },
        },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { officer_id: '$_id', officer_name: '$officer.name', cases: 1, _id: 0 } },
      ]);

      const headerRow = worksheet.addRow(['Officer ID', 'Officer Name', 'Cases']);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' }, bold: true };

      data.forEach((row) => {
        worksheet.addRow([row.officer_id, row.officer_name || 'Unknown', row.cases]);
      });

      worksheet.columns.forEach((column) => {
        column.width = 20;
      });
      break;
    }
    default:
      throw new Error(`Invalid report type: ${reportType}`);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const generatePDFReport = async (
  reportType,
  startDate,
  endDate,
  filters = {},
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Police Tax Control System', { align: 'center' });
      doc.fontSize(16).text(`Report: ${reportType.replace(/-/g, ' ').toUpperCase()}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).fillColor('gray').text(`Period: ${startDate ? startDate.toLocaleDateString() : 'All'} - ${endDate ? endDate.toLocaleDateString() : 'All'}`, { align: 'center' });
      doc.moveDown(2);
      doc.fillColor('black');

  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = startDate;
    if (endDate) dateFilter.createdAt.$lte = endDate;
  }
      if (filters.case_type) dateFilter.case_type = filters.case_type;
      if (filters.status) dateFilter.status = filters.status;

      // Generate report content based on type
      if (reportType === 'cases') {
        const { CheckInModel } = await import('../models/index.js');
        const cases = await CaseModel.find(dateFilter)
          .populate({
            path: 'check_in_id',
            select: 'fine business_id check_in_date phone notes',
            populate: {
              path: 'business_id',
              select: 'business_name business_type owner_name business_id tax_id',
            },
          })
          .populate('assigned_officer_id', 'name email')
          .populate('resolution_papers.officer_id', 'name email')
          .sort({ createdAt: -1 })
          .lean();

        // Summary statistics
        doc.fontSize(14).text('Summary Statistics', { underline: true });
        doc.moveDown();
        const totalCases = cases.length;
        const totalFine = cases.reduce((sum, c) => sum + (c.check_in_id?.fine || 0), 0);
        doc.fontSize(11).text(`Total Cases: ${totalCases}`);
        doc.text(`Total Fine Amount: $${totalFine.toFixed(2)}`);
        doc.moveDown(2);

        // Cases by Type Table
        const casesByType = {};
        cases.forEach((c) => {
          casesByType[c.case_type] = (casesByType[c.case_type] || 0) + 1;
        });

        doc.fontSize(14).text('Cases by Type', { underline: true });
        doc.moveDown();
        doc.fontSize(11);
        Object.entries(casesByType).forEach(([type, count]) => {
          doc.text(`${type}: ${count}`, { indent: 20 });
        });
        doc.moveDown(2);

        // Cases by Status Table
        const casesByStatus = {};
        cases.forEach((c) => {
          casesByStatus[c.status] = (casesByStatus[c.status] || 0) + 1;
        });

        doc.fontSize(14).text('Cases by Status', { underline: true });
        doc.moveDown();
        doc.fontSize(11);
        Object.entries(casesByStatus).forEach(([status, count]) => {
          doc.text(`${status}: ${count}`, { indent: 20 });
        });
        doc.moveDown(2);

        // Evidence lookup for PDF
        const evList = await EvidenceModel.find({ case_id: { $in: cases.map((c) => c._id) } })
          .select('case_id file_url file_type description')
          .lean();
        const evMap = {};
        evList.forEach((ev) => {
          const key = ev.case_id.toString();
          if (!evMap[key]) evMap[key] = [];
          evMap[key].push(ev);
        });

        // Cases Table
        doc.fontSize(14).text('Case Details', { underline: true });
        doc.moveDown();
        
        const tableTop = doc.y;
        const itemHeight = 140;
        const pageHeight = doc.page.height - 100;

        // Table headers
        doc.fontSize(9).fillColor('white');
        doc.rect(50, tableTop, 495, 20).fillAndStroke('black', 'black');
        doc.text('Case #', 55, tableTop + 5);
        doc.text('Type', 140, tableTop + 5);
        doc.text('Status', 200, tableTop + 5);
        doc.text('Fine', 270, tableTop + 5);
        doc.text('Officer', 330, tableTop + 5);
        doc.text('Date', 450, tableTop + 5);
        
        doc.fillColor('black');
        let y = tableTop + 25;
        
        cases.slice(0, 20).forEach((c) => {
          if (y + itemHeight > pageHeight) {
            doc.addPage();
            y = 50;
          }

          const evs = evMap[c._id.toString()] || [];
          const evSummary = evs.length
            ? evs.map((e) => `${e.file_type || 'file'}: ${FILE_BASE}${e.file_url}`).slice(0, 3).join('\n')
            : 'None';

          doc.fontSize(8);
          doc.text(c.case_number || '-', 55, y + 5);
          doc.text(c.case_type || '-', 140, y + 5);
          doc.text(c.status || '-', 200, y + 5);
          doc.text(`$${(c.check_in_id?.fine || 0).toFixed(2)}`, 270, y + 5);
          doc.text(c.assigned_officer_id?.name || 'Unassigned', 330, y + 5);
          doc.text(c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-', 450, y + 5);
          
          doc.text(`Business: ${c.check_in_id?.business_id?.business_name || '-'}`, 55, y + 18);
          doc.text(`Type: ${c.check_in_id?.business_id?.business_type || '-'}`, 200, y + 18);
          doc.text(`Owner: ${c.check_in_id?.business_id?.owner_name || '-'}`, 350, y + 18);
          
          doc.text('Evidence:', 55, y + 30);
          doc.text(evSummary, 120, y + 30, { width: 400 });

          doc.text(`Notes: ${c.check_in_id?.notes || '-'}`, 55, y + 60, { width: 480 });

          doc.moveTo(50, y + itemHeight - 5).lineTo(545, y + itemHeight - 5).stroke('#cccccc');
          y += itemHeight;
        });

        if (cases.length > 20) {
          doc.moveDown();
          doc.fontSize(10).fillColor('gray').text(`Showing first 20 of ${cases.length} cases.`, { indent: 20 });
        }
      } else {
        // For summary reports, generate tables
        if (reportType === 'cases-summary' || reportType === 'status-summary') {
          const groupField = reportType === 'cases-summary' ? 'case_type' : 'status';
          const data = await CaseModel.aggregate([
            { $match: dateFilter },
            { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
            { $project: { [groupField]: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } },
          ]);

          doc.fontSize(14).text(`${groupField === 'case_type' ? 'Cases by Type' : 'Cases by Status'}`, { underline: true });
          doc.moveDown();

          const tableTop = doc.y;
          doc.fontSize(9).fillColor('white');
          doc.rect(50, tableTop, 495, 20).fillAndStroke('black', 'black');
          doc.text(groupField === 'case_type' ? 'Case Type' : 'Status', 55, tableTop + 5);
          doc.text('Count', 400, tableTop + 5);
          
          doc.fillColor('black');
          let y = tableTop + 25;
          
          data.forEach((row) => {
            doc.fontSize(11);
            doc.text(String(row[groupField] || '-'), 55, y);
            doc.text(String(row.count), 400, y);
            doc.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
            y += 20;
          });
        } else if (reportType === 'officer-workload') {
          const data = await CaseModel.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$assigned_officer_id', cases: { $sum: 1 } } },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'officer',
              },
            },
            { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
            { $project: { officer_id: '$_id', officer_name: '$officer.name', cases: 1, _id: 0 } },
            { $sort: { cases: -1 } },
          ]);

          doc.fontSize(14).text('Officer Workload', { underline: true });
          doc.moveDown();

          const tableTop = doc.y;
          doc.fontSize(9).fillColor('white');
          doc.rect(50, tableTop, 495, 20).fillAndStroke('black', 'black');
          doc.text('Officer Name', 55, tableTop + 5);
          doc.text('Cases', 400, tableTop + 5);
          
          doc.fillColor('black');
          let y = tableTop + 25;
          
          data.forEach((row) => {
            doc.fontSize(11);
            doc.text(row.officer_name || 'Unknown', 55, y);
            doc.text(String(row.cases), 400, y);
            doc.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
            y += 20;
          });
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

