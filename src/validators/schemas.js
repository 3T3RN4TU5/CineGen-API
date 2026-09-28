import { z } from 'zod';
import { GENERATION_TYPES } from '../config/models.config.js';
import { CAMERA_PRESETS, STYLE_PRESETS } from '../config/presets.config.js';
import { GENERATION_STATUSES } from '../models/Generation.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.email().trim().toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const createGenerationSchema = z
  .object({
    type: z.enum(GENERATION_TYPES),
    modelKey: z.string().min(1).max(64),
    prompt: z.string().trim().min(3).max(1000),
    cameraPreset: z
      .enum(Object.keys(CAMERA_PRESETS))
      .nullish()
      .transform((v) => v ?? undefined),
    stylePreset: z
      .enum(Object.keys(STYLE_PRESETS))
      .nullish()
      .transform((v) => v ?? undefined),
    imageUrl: z
      .url({ protocol: /^https$/ })
      .nullish()
      .transform((v) => v ?? undefined),
    params: z
      .object({
        duration: z.coerce.number().int().positive().optional(),
        aspectRatio: z.string().max(10).optional(),
        resolution: z.string().max(10).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .refine((b) => b.type !== 'image-to-video' || !!b.imageUrl, {
    message: 'imageUrl is required for image-to-video',
    path: ['imageUrl'],
  });

export const listGenerationsSchema = z.object({
  ...pageQuery,
  status: z.enum(GENERATION_STATUSES).optional(),
  type: z.enum(GENERATION_TYPES).optional(),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
});

export const idParamSchema = z.object({ id: objectId });

export const pageSchema = z.object(pageQuery);

export const adminUsersQuerySchema = z.object({
  ...pageQuery,
  search: z.string().trim().max(100).optional(),
});

export const adminCreditsSchema = z.object({
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, 'amount must not be zero')
    .refine((n) => Math.abs(n) <= 100000, 'amount too large'),
  reason: z.string().trim().max(200).optional(),
});

export const adminStatusSchema = z.object({ isActive: z.boolean() });

export const adminGenerationsQuerySchema = z.object({
  ...pageQuery,
  status: z.enum(GENERATION_STATUSES).optional(),
  user: objectId.optional(),
  type: z.enum(GENERATION_TYPES).optional(),
});

export const adminModelToggleSchema = z.object({ enabled: z.boolean() });
