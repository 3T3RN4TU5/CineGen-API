export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/docs/**'],
};
