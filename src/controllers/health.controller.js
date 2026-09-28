import { dbState } from '../config/db.js';
import { sendSuccess } from '../utils/response.js';

export const health = (_req, res) => {
  const db = dbState();
  sendSuccess(
    res,
    {
      status: db === 'connected' ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
};
