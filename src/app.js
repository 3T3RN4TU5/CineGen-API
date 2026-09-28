import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { swaggerSpec } from './docs/swagger.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { sanitize } from './middleware/sanitize.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1); // Render / Vercel sit behind a proxy
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        !origin || env.clientOrigins.includes(origin)
          ? cb(null, true)
          : cb(new ApiError(403, 'CORS_BLOCKED', 'Origin not allowed')),
      credentials: true,
    }),
  );
  app.use(globalLimiter);
  // Keep the raw body for webhook signature verification.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(sanitize);
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/', (_req, res) =>
    res.json({
      success: true,
      data: { name: 'CineGen API', version: '1.0.0', docs: '/api/docs', health: '/api/v1/health' },
    }),
  );
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
  // Swagger UI needs inline scripts, so relax CSP for the docs route only.
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customSiteTitle: 'CineGen API Docs' }),
  );
  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

export default createApp;
