import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

// --- Mocks (registered before the app is imported) ---------------------------
export const falMock = {
  config: jest.fn(),
  queue: { submit: jest.fn(), status: jest.fn(), result: jest.fn() },
};
jest.unstable_mockModule('@fal-ai/client', () => ({ fal: falMock }));

export const cloudinaryMock = {
  config: jest.fn(),
  url: jest.fn((id) => `https://res.cloudinary.com/test/video/upload/${id}.jpg`),
  uploader: {
    upload: jest.fn(async (_url, opts) => ({
      secure_url: `https://res.cloudinary.com/test/${opts.resource_type}/upload/out.${opts.resource_type === 'video' ? 'mp4' : 'png'}`,
      public_id: 'cinegen/outputs/out',
    })),
    upload_stream: jest.fn((_opts, cb) => ({
      end: () =>
        cb(null, {
          secure_url: 'https://res.cloudinary.com/test/image/upload/in.png',
          public_id: 'cinegen/uploads/in',
        }),
    })),
    destroy: jest.fn(async () => ({ result: 'ok' })),
  },
};
jest.unstable_mockModule('cloudinary', () => ({ v2: cloudinaryMock }));

// --- DB --------------------------------------------------------------------
let memoryServer;

/** Uses TEST_MONGO_URI when provided, otherwise spins up mongodb-memory-server. */
export const setupDB = async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }
  const dbName = `cinegen_test_${crypto.randomBytes(4).toString('hex')}`;
  await mongoose.connect(uri, { dbName });
  if (process.env.TEST_FERRETDB) {
    // FerretDB (used only when mongod can't be downloaded) lacks findAndModify projections;
    // disable select:false on password there. Real MongoDB runs keep the production schema.
    const { User } = await import('../src/models/User.js');
    User.schema.path('password').selected = undefined;
    User.schema.path('password').options.select = undefined;
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
};

export const clearDB = async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

export const teardownDB = async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
};

// --- App helpers -------------------------------------------------------------
export const loadApp = async () => {
  const { createApp } = await import('../src/app.js');
  return createApp();
};

let counter = 0;
export const registerUser = async (request, overrides = {}) => {
  counter += 1;
  const body = {
    name: 'Test User',
    email: `user${counter}_${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  };
  const res = await request.post('/api/v1/auth/register').send(body);
  return { ...res.body.data, password: body.password, res };
};

export const makeAdmin = async (request) => {
  const { User } = await import('../src/models/User.js');
  const { user, token } = await registerUser(request);
  await User.updateOne({ _id: user._id }, { role: 'admin' });
  return { user, token };
};
