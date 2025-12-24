import { Schema, model } from 'mongoose';

import { Roles } from '../constants/enums.js';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Roles, required: true, default: 'officer' },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema);

