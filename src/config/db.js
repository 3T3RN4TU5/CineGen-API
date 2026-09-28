import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

let connecting = null;

/** Connects to MongoDB once; safe to call repeatedly (serverless-friendly). */
export const connectDB = async (uri = env.MONGO_URI) => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    connecting = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10000 })
      .then((m) => {
        logger.info({ host: m.connection.host }, 'MongoDB connected');
        return m.connection;
      })
      .catch((err) => {
        connecting = null;
        throw err;
      });
  }
  return connecting;
};

export const disconnectDB = async () => {
  connecting = null;
  await mongoose.disconnect();
};

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
export const dbState = () => STATES[mongoose.connection.readyState] ?? 'unknown';
