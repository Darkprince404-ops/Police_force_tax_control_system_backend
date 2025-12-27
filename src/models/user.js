import { Schema, model } from 'mongoose';

import { Roles } from '../constants/enums.js';

const UserStatus = ['active', 'inactive', 'suspended'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Roles, required: true, default: 'officer' },
    status: { type: String, enum: UserStatus, default: 'active' },
    supervisor_id: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Index for efficient supervisor queries
userSchema.index({ supervisor_id: 1, role: 1 });

export const UserModel = model('User', userSchema);
export { UserStatus };

