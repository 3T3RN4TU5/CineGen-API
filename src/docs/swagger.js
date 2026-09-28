import { env } from '../config/env.js';
import { GENERATION_TYPES } from '../config/models.config.js';
import { CAMERA_PRESETS, STYLE_PRESETS } from '../config/presets.config.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description, schema) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { success: { type: 'boolean', example: true }, data: schema ?? { type: 'object' } },
      },
    },
  },
});
const err = (description) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const auth = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
];
const statusEnum = ['queued', 'processing', 'completed', 'failed'];

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CineGen API',
    version: '1.0.0',
    description:
      'AI video & image generation platform (Higgsfield-style) powered by fal.ai. Register, copy the token, click **Authorize**, and start generating.',
  },
  servers: [{ url: `${env.API_BASE_URL}/api/v1` }, { url: '/api/v1', description: 'Same origin' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: { code: { type: 'string', example: 'INSUFFICIENT_CREDITS' }, message: { type: 'string' } },
          },
        },
      },
      Meta: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
          credits: { type: 'integer' },
          dailyGenerationCount: { type: 'integer' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResult: { type: 'object', properties: { user: ref('User'), token: { type: 'string' } } },
      Generation: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          user: { type: 'string' },
          type: { type: 'string', enum: GENERATION_TYPES },
          modelKey: { type: 'string' },
          userPrompt: { type: 'string' },
          enhancedPrompt: { type: 'string' },
          cameraPreset: { type: 'string' },
          stylePreset: { type: 'string' },
          inputImageUrl: { type: 'string' },
          params: {
            type: 'object',
            properties: {
              duration: { type: 'integer' },
              aspectRatio: { type: 'string' },
              resolution: { type: 'string' },
            },
          },
          status: { type: 'string', enum: statusEnum },
          falRequestId: { type: 'string' },
          outputUrl: { type: 'string' },
          thumbnailUrl: { type: 'string' },
          creditsCharged: { type: 'integer' },
          refunded: { type: 'boolean' },
          errorMessage: { type: 'string' },
          completedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateGeneration: {
        type: 'object',
        required: ['type', 'modelKey', 'prompt'],
        properties: {
          type: { type: 'string', enum: GENERATION_TYPES, example: 'text-to-video' },
          modelKey: { type: 'string', example: 'ltx-fast' },
          prompt: { type: 'string', maxLength: 1000, example: 'a red sports car on a rainy city street at night' },
          cameraPreset: { type: 'string', enum: Object.keys(CAMERA_PRESETS), example: 'dolly-in' },
          stylePreset: { type: 'string', enum: Object.keys(STYLE_PRESETS), example: 'neon-noir' },
          imageUrl: {
            type: 'string',
            nullable: true,
            description: 'Required for image-to-video (use /generations/upload-image)',
          },
          params: {
            type: 'object',
            properties: {
              duration: { type: 'integer', example: 6 },
              aspectRatio: { type: 'string', example: '16:9' },
              resolution: { type: 'string' },
            },
          },
        },
      },
      CreditTransaction: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          amount: { type: 'integer' },
          reason: { type: 'string', enum: ['signup_bonus', 'generation', 'refund', 'admin_grant', 'admin_revoke'] },
          generation: { type: 'string' },
          balanceAfter: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  tags: ['Health', 'Auth', 'Catalog', 'Generations', 'Credits', 'Webhooks', 'Admin'].map((name) => ({ name })),
  paths: {
    '/health': { get: { tags: ['Health'], summary: 'Service health + DB state', responses: { 200: ok('Healthy') } } },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account (grants signup credits)',
        requestBody: body({
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Jane Doe' },
            email: { type: 'string', example: 'jane@example.com' },
            password: { type: 'string', example: 'secret123' },
          },
        }),
        responses: {
          201: ok('Registered', ref('AuthResult')),
          400: err('Validation error'),
          409: err('Email already registered'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        requestBody: body({
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: { 200: ok('Logged in', ref('AuthResult')), 401: err('Invalid credentials') },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: auth,
        responses: {
          200: ok('Profile', { type: 'object', properties: { user: ref('User') } }),
          401: err('Unauthorized'),
        },
      },
    },
    '/models': {
      get: {
        tags: ['Catalog'],
        summary: 'List enabled AI models',
        parameters: [{ name: 'type', in: 'query', schema: { type: 'string', enum: GENERATION_TYPES } }],
        responses: { 200: ok('Models') },
      },
    },
    '/presets': {
      get: { tags: ['Catalog'], summary: 'List camera and style presets', responses: { 200: ok('Presets') } },
    },
    '/generations': {
      post: {
        tags: ['Generations'],
        summary: 'Create a generation (async)',
        security: auth,
        requestBody: body(ref('CreateGeneration')),
        responses: {
          202: ok('Accepted — poll GET /generations/{id}', {
            type: 'object',
            properties: { generation: ref('Generation') },
          }),
          400: err('Validation error'),
          402: err('Insufficient credits'),
          429: err('Rate or daily limit reached'),
        },
      },
      get: {
        tags: ['Generations'],
        summary: 'List own generations',
        security: auth,
        parameters: [
          ...pageParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: statusEnum } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: GENERATION_TYPES } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['-createdAt', 'createdAt'] } },
        ],
        responses: {
          200: ok('Generations', {
            type: 'object',
            properties: { generations: { type: 'array', items: ref('Generation') } },
          }),
        },
      },
    },
    '/generations/upload-image': {
      post: {
        tags: ['Generations'],
        summary: 'Upload an input image (jpg/png/webp, max 10 MB)',
        security: auth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: {
          201: ok('Uploaded', { type: 'object', properties: { imageUrl: { type: 'string' } } }),
          400: err('Invalid file'),
          413: err('Too large'),
        },
      },
    },
    '/generations/{id}': {
      get: {
        tags: ['Generations'],
        summary: 'Get one generation (poll this for status)',
        security: auth,
        parameters: [idParam],
        responses: { 200: ok('Generation'), 404: err('Not found') },
      },
      delete: {
        tags: ['Generations'],
        summary: 'Delete a completed/failed generation',
        security: auth,
        parameters: [idParam],
        responses: { 200: ok('Deleted'), 404: err('Not found'), 409: err('Still in progress') },
      },
    },
    '/credits': {
      get: {
        tags: ['Credits'],
        summary: 'Balance + transaction history',
        security: auth,
        parameters: pageParams,
        responses: {
          200: ok('Credits', {
            type: 'object',
            properties: {
              balance: { type: 'integer' },
              transactions: { type: 'array', items: ref('CreditTransaction') },
            },
          }),
        },
      },
    },
    '/webhooks/fal': {
      post: {
        tags: ['Webhooks'],
        summary: 'fal.ai completion webhook (signature-verified, idempotent)',
        responses: { 200: ok('Processed'), 401: err('Bad signature') },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List users',
        security: auth,
        parameters: [
          ...pageParams,
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Email contains' },
        ],
        responses: { 200: ok('Users'), 403: err('Not an admin') },
      },
    },
    '/admin/users/{id}/credits': {
      patch: {
        tags: ['Admin'],
        summary: 'Grant (positive) or revoke (negative) credits',
        security: auth,
        parameters: [idParam],
        requestBody: body({
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'integer', example: 100 },
            reason: { type: 'string', example: 'Beta tester bonus' },
          },
        }),
        responses: {
          200: ok('Updated user'),
          400: err('Invalid amount'),
          403: err('Not an admin'),
          404: err('User not found'),
        },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Activate / deactivate a user',
        security: auth,
        parameters: [idParam],
        requestBody: body({ type: 'object', required: ['isActive'], properties: { isActive: { type: 'boolean' } } }),
        responses: { 200: ok('Updated user'), 403: err('Not an admin') },
      },
    },
    '/admin/generations': {
      get: {
        tags: ['Admin'],
        summary: 'All generations',
        security: auth,
        parameters: [
          ...pageParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: statusEnum } },
          { name: 'user', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: ok('Generations') },
      },
    },
    '/admin/stats': {
      get: { tags: ['Admin'], summary: 'Platform totals', security: auth, responses: { 200: ok('Stats') } },
    },
    '/admin/models': {
      get: { tags: ['Admin'], summary: 'All models incl. disabled', security: auth, responses: { 200: ok('Models') } },
    },
    '/admin/models/{key}': {
      patch: {
        tags: ['Admin'],
        summary: 'Enable / disable a model (in-memory until restart)',
        security: auth,
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: body({ type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } }),
        responses: { 200: ok('Model'), 404: err('Not found') },
      },
    },
  },
};
