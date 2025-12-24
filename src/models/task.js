import { Schema, model } from 'mongoose';

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    type: { type: String, enum: ['case', 'general'], required: true },
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending', index: true },
    assigned_to: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    case_id: { type: Schema.Types.ObjectId, ref: 'Case', index: true },
    due_date: { type: Date, index: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
  },
  { timestamps: true },
);

taskSchema.index({ assigned_to: 1, status: 1 });
taskSchema.index({ type: 1, status: 1 });

export const TaskModel = model('Task', taskSchema);
