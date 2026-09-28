import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? (process.env.TEST_LOG_LEVEL ?? 'silent') : env.LOG_LEVEL,
  redact: ['req.headers.authorization', '*.password', '*.FAL_KEY'],
  ...(env.isProd || env.isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
});
