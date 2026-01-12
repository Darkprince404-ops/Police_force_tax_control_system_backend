import { Schema, model } from 'mongoose';

import { CaseResult, CaseStatus, CaseTypes } from '../constants/enums.js';

const resolutionPaperSchema = new Schema(
  {
    paper_type: { type: String, enum: ['fine_paid', 'comeback_date'], required: true },
    file_url: { type: String, required: true },
    extracted_date: { type: Date },
    confirmed_date: { type: Date },
    officer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploaded_at: { type: Date, required: true, default: () => new Date() },
    notes: { type: String },
  },
  { _id: true, timestamps: false },
);

const caseSchema = new Schema(
  {
    check_in_id: { type: Schema.Types.ObjectId, ref: 'CheckIn', required: true, index: true },
    case_type: { type: String, enum: CaseTypes, required: true },
    case_number: { type: String, required: true, unique: true },
    description: { type: String },
    violations: { type: String },
    status: { type: String, enum: CaseStatus, required: true, default: 'UnderAssessment' },
    result: { type: String, enum: CaseResult },
    assigned_officer_id: { type: Schema.Types.ObjectId, ref: 'User' },
    deadline_date: { type: Date },
    comeback_date: { type: Date, index: true }, // Date when offender should come back
    comeback_notification_sent: { type: Boolean, default: false }, // Track if notification was sent
    fine_amount: { type: Number, default: 0 }, // Fine amount if found guilty
    resolution_papers: [resolutionPaperSchema],
    resolvedAt: { type: Date, index: true }, // Timestamp when case was resolved
    lastActivityAt: { type: Date, index: true }, // Timestamp of last activity/update
    statusChangedAt: { type: Date, index: true }, // Timestamp when status last changed
  },
  { timestamps: true },
);

caseSchema.index({ case_type: 1, status: 1, case_number: 1 });
caseSchema.index({ status: 1, createdAt: -1 }); // Needs Attention & Recent Activity
caseSchema.index({ assigned_officer_id: 1, status: 1 }); // My Team
caseSchema.index({ status: 1, comeback_date: 1 }); // Overdue Comebacks (note: order matters, equality first often better, but range usage varies. Status is equality, comeback_date is range)
caseSchema.index({ status: 1, lastActivityAt: -1 }); // Aging assessments query
caseSchema.index({ status: 1, resolvedAt: -1 }); // Resolved cases queries
caseSchema.index({ status: 1, statusChangedAt: -1 }); // Status change tracking
caseSchema.index({ lastActivityAt: 1 }); // General activity queries


export const CaseModel = model('Case', caseSchema);
