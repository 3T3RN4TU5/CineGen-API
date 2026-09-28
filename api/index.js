// Vercel serverless entry point. Reuses the DB connection across warm invocations.
import { connectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';

const app = createApp();

export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}
