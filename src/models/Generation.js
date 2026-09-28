import mongoose from 'mongoose';
import { GENERATION_TYPES } from '../config/models.config.js';

export const GENERATION_STATUSES = ['queued', 'processing', 'completed', 'failed'];
export const TERMINAL_STATUSES = ['completed', 'failed'];

const generationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: GENERATION_TYPES, required: true },
    modelKey: { type: String, required: true },
    userPrompt: { type: String, required: true, maxlength: 1000 },
    enhancedPrompt: { type: String },
    cameraPreset: { type: String },
    stylePreset: { type: String },
    inputImageUrl: { type: String },
    params: {
      duration: Number,
      aspectRatio: String,
      resolution: String,
    },
    status: { type: String, enum: GENERATION_STATUSES, default: 'queued', index: true },
    falRequestId: { type: String, index: { unique: true, sparse: true } },
    outputUrl: { type: String },
    outputPublicId: { type: String },
    thumbnailUrl: { type: String },
    creditsCharged: { type: Number, default: 0 },
    refunded: { type: Boolean, default: false },
    errorMessage: { type: String },
    completedAt: { type: Date },
    lastCheckedAt: { type: Date },
    lockedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.outputPublicId;
        return ret;
      },
    },
  },
);

generationSchema.index({ user: 1, createdAt: -1 });
generationSchema.index({ status: 1, updatedAt: 1 });

export const Generation = mongoose.models.Generation || mongoose.model('Generation', generationSchema);
