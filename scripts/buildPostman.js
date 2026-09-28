// Regenerates postman_collection.json: node scripts/buildPostman.js
import { writeFileSync } from 'node:fs';

const json = (body) => ({ mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } });
const req = (name, method, path, { body, auth = true, tests, query } = {}) => ({
  name,
  ...(tests ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }] } : {}),
  request: {
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(auth ? {} : { auth: { type: 'noauth' } }),
    url: {
      raw: `{{baseUrl}}/api/v1${path}${query ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : ''}`,
      host: ['{{baseUrl}}'],
      path: ['api', 'v1', ...path.split('/').filter(Boolean)],
      ...(query ? { query } : {}),
    },
    ...(body ? { body: json(body) } : {}),
  },
});

const saveToken = [
  'pm.test("status ok", () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));',
  'const d = pm.response.json().data;',
  'pm.collectionVariables.set("token", d.token);',
  'pm.collectionVariables.set("userId", d.user._id);',
];

const collection = {
  info: {
    name: 'CineGen API',
    description:
      'Full flow: register → catalog → generate → poll → credits → admin. Set {{baseUrl}} to your deployment.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000' },
    { key: 'email', value: 'demo+{{$timestamp}}@example.com' },
    { key: 'token', value: '' },
    { key: 'adminToken', value: '' },
    { key: 'userId', value: '' },
    { key: 'generationId', value: '' },
    { key: 'imageUrl', value: '' },
  ],
  item: [
    { name: 'Health', item: [req('Health', 'GET', '/health', { auth: false })] },
    {
      name: 'Auth',
      item: [
        req('Register', 'POST', '/auth/register', {
          auth: false,
          body: { name: 'Demo User', email: '{{email}}', password: 'password123' },
          tests: ['pm.collectionVariables.set("email", JSON.parse(pm.request.body.raw).email);', ...saveToken],
        }),
        req('Login', 'POST', '/auth/login', {
          auth: false,
          body: { email: '{{email}}', password: 'password123' },
          tests: saveToken,
        }),
        req('Me', 'GET', '/auth/me'),
      ],
    },
    {
      name: 'Catalog',
      item: [req('Models', 'GET', '/models', { auth: false }), req('Presets', 'GET', '/presets', { auth: false })],
    },
    {
      name: 'Generations',
      item: [
        req('Create text-to-image', 'POST', '/generations', {
          body: {
            type: 'text-to-image',
            modelKey: 'flux-schnell',
            prompt: 'a lighthouse on a rocky cliff at dusk',
            stylePreset: 'cinematic',
            params: { aspectRatio: '16:9' },
          },
          tests: [
            'pm.test("202 accepted", () => pm.response.to.have.status(202));',
            'pm.collectionVariables.set("generationId", pm.response.json().data.generation._id);',
          ],
        }),
        req('Create text-to-video', 'POST', '/generations', {
          body: {
            type: 'text-to-video',
            modelKey: 'ltx-fast',
            prompt: 'a red sports car on a rainy city street at night',
            cameraPreset: 'dolly-in',
            stylePreset: 'neon-noir',
            imageUrl: null,
            params: { duration: 6, aspectRatio: '16:9' },
          },
          tests: [
            'if (pm.response.code === 202) pm.collectionVariables.set("generationId", pm.response.json().data.generation._id);',
          ],
        }),
        {
          name: 'Upload image (image-to-video input)',
          event: [
            {
              listen: 'test',
              script: { exec: ['pm.collectionVariables.set("imageUrl", pm.response.json().data.imageUrl);'] },
            },
          ],
          request: {
            method: 'POST',
            url: {
              raw: '{{baseUrl}}/api/v1/generations/upload-image',
              host: ['{{baseUrl}}'],
              path: ['api', 'v1', 'generations', 'upload-image'],
            },
            body: { mode: 'formdata', formdata: [{ key: 'image', type: 'file', src: [] }] },
          },
        },
        req('Create image-to-video', 'POST', '/generations', {
          body: {
            type: 'image-to-video',
            modelKey: 'seedance-i2v',
            prompt: 'the scene slowly comes alive',
            cameraPreset: 'orbit',
            imageUrl: '{{imageUrl}}',
            params: { duration: 5, aspectRatio: 'auto' },
          },
        }),
        req('Get generation (poll every 5s)', 'GET', '/generations/{{generationId}}'),
        req('List my generations', 'GET', '/generations', {
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'sort', value: '-createdAt' },
          ],
        }),
        req('Delete generation', 'DELETE', '/generations/{{generationId}}'),
      ],
    },
    { name: 'Credits', item: [req('Balance + history', 'GET', '/credits')] },
    {
      name: 'Admin (use an admin token)',
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{adminToken}}', type: 'string' }] },
      item: [
        req('List users', 'GET', '/admin/users', { query: [{ key: 'search', value: 'example.com' }] }),
        req('Grant credits', 'PATCH', '/admin/users/{{userId}}/credits', {
          body: { amount: 100, reason: 'Demo grant' },
        }),
        req('Revoke credits', 'PATCH', '/admin/users/{{userId}}/credits', {
          body: { amount: -10, reason: 'Correction' },
        }),
        req('Deactivate user', 'PATCH', '/admin/users/{{userId}}/status', { body: { isActive: false } }),
        req('Activate user', 'PATCH', '/admin/users/{{userId}}/status', { body: { isActive: true } }),
        req('All generations', 'GET', '/admin/generations', { query: [{ key: 'status', value: 'completed' }] }),
        req('Stats', 'GET', '/admin/stats'),
        req('All models', 'GET', '/admin/models'),
        req('Disable model', 'PATCH', '/admin/models/kling-v3', { body: { enabled: false } }),
      ],
    },
  ],
};

writeFileSync(new URL('../postman_collection.json', import.meta.url), `${JSON.stringify(collection, null, 2)}\n`);
console.error('postman_collection.json written');
