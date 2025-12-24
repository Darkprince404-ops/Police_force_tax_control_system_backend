import { Schema, model } from 'mongoose';

const reportScheduleSchema = new Schema(
  {
    email: { type: String, required: true },
    report_type: { type: String, required: true },
    format: { type: String, enum: ['csv', 'excel', 'pdf'], default: 'excel' },
    cron: { type: String, required: true },
    filters: { type: Object },
    last_run_at: { type: Date },
  },
  { timestamps: true },
);

export const ReportScheduleModel = model('ReportSchedule', reportScheduleSchema);

