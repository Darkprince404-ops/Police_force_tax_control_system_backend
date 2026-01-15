import mongoose from 'mongoose';

const loginEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    method: {
      type: String,
      enum: ['gps', 'ip'],
      required: true,
    },
    geo_method: {
      type: String,
      enum: ['gps', 'ip', 'none'],
      default: 'ip',
    },
    latitude: {
      type: Number,
      required: function() {
        return this.method === 'gps';
      },
    },
    longitude: {
      type: Number,
      required: function() {
        return this.method === 'gps';
      },
    },
    accuracy: {
      type: Number, // in meters for GPS
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    city: String,
    region: String,
    country: String,
    countryCode: String,
    timezone: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
loginEventSchema.index({ userId: 1, timestamp: -1 });
loginEventSchema.index({ timestamp: -1 });

export const LoginEventModel = mongoose.model('LoginEvent', loginEventSchema);
