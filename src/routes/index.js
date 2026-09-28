import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { authLimiter, generationLimiter } from '../middleware/rateLimit.js';
import { uploadImage as uploadMw } from '../middleware/upload.js';
import * as s from '../validators/schemas.js';
import { health } from '../controllers/health.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as catalog from '../controllers/catalog.controller.js';
import * as gen from '../controllers/generation.controller.js';
import * as credits from '../controllers/credit.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { falWebhook } from '../controllers/webhook.controller.js';
import { pollJobs } from '../controllers/internal.controller.js';

const router = Router();

router.get('/health', health);

// Auth
router.post('/auth/register', authLimiter, validate(s.registerSchema), h(auth.register));
router.post('/auth/login', authLimiter, validate(s.loginSchema), h(auth.login));
router.get('/auth/me', protect, auth.me);

// Catalog
router.get('/models', catalog.listModels);
router.get('/presets', catalog.listAllPresets);

// Generations
const g = Router();
g.use(protect);
g.post('/', generationLimiter, validate(s.createGenerationSchema), h(gen.create));
g.post('/upload-image', generationLimiter, uploadMw, h(gen.uploadImage));
g.get('/', validate(s.listGenerationsSchema, 'query'), h(gen.list));
g.get('/:id', validate(s.idParamSchema, 'params'), h(gen.getOne));
g.delete('/:id', validate(s.idParamSchema, 'params'), h(gen.remove));
router.use('/generations', g);

// Credits
router.get('/credits', protect, validate(s.pageSchema, 'query'), h(credits.getCredits));

// Webhooks (no JWT — verified by fal signature)
router.post('/webhooks/fal', h(falWebhook));

// Internal cron (serverless deployments)
router.all('/internal/poll-jobs', h(pollJobs));

// Admin
const a = Router();
a.use(protect, requireRole('admin'));
a.get('/users', validate(s.adminUsersQuerySchema, 'query'), h(admin.listUsers));
a.patch(
  '/users/:id/credits',
  validate(s.idParamSchema, 'params'),
  validate(s.adminCreditsSchema),
  h(admin.updateCredits),
);
a.patch('/users/:id/status', validate(s.idParamSchema, 'params'), validate(s.adminStatusSchema), h(admin.updateStatus));
a.get('/generations', validate(s.adminGenerationsQuerySchema, 'query'), h(admin.listGenerations));
a.get('/stats', h(admin.stats));
a.get('/models', admin.listModels);
a.patch('/models/:key', validate(s.adminModelToggleSchema), admin.toggleModel);
router.use('/admin', a);

export default router;
