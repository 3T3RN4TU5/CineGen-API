// Test environment — never touches real fal.ai or Cloudinary (both are mocked in tests/helpers.js).
Object.assign(process.env, {
  NODE_ENV: 'test',
  API_BASE_URL: 'https://api.cinegen.test',
  CLIENT_URL: 'http://localhost:5173',
  MONGO_URI: 'mongodb://unused-in-tests',
  JWT_SECRET: 'test-secret-that-is-long-enough',
  FAL_KEY: 'test-fal-key',
  FAL_WEBHOOK_VERIFY: 'false',
  CLOUDINARY_CLOUD_NAME: 'test',
  CLOUDINARY_API_KEY: 'test',
  CLOUDINARY_API_SECRET: 'test',
  SIGNUP_FREE_CREDITS: '20',
  DAILY_GENERATION_LIMIT: '10',
  JOB_TIMEOUT_MINUTES: '15',
  ENABLE_POLLER: 'false',
  CRON_SECRET: 'cron-secret',
});
