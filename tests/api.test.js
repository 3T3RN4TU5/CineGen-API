import { jest } from '@jest/globals';
import supertest from 'supertest';
import crypto from 'node:crypto';
import { falMock, cloudinaryMock, setupDB, clearDB, teardownDB, loadApp, registerUser, makeAdmin } from './helpers.js';

let request;
let User;
let Generation;
let CreditTransaction;
let generationService;

beforeAll(async () => {
  await setupDB();
  request = supertest(await loadApp());
  ({ User } = await import('../src/models/User.js'));
  ({ Generation } = await import('../src/models/Generation.js'));
  ({ CreditTransaction } = await import('../src/models/CreditTransaction.js'));
  generationService = await import('../src/services/generation.service.js');
});
afterAll(teardownDB);
beforeEach(async () => {
  await clearDB();
  jest.clearAllMocks();
  let n = 0;
  falMock.queue.submit.mockImplementation(async () => ({ request_id: `req-${++n}-${Date.now()}` }));
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const imageGen = {
  type: 'text-to-image',
  modelKey: 'flux-schnell',
  prompt: 'a lighthouse at dusk',
  params: { aspectRatio: '1:1' },
};
const videoGen = {
  type: 'text-to-video',
  modelKey: 'ltx-fast',
  prompt: 'a red sports car on a rainy city street at night',
  cameraPreset: 'dolly-in',
  stylePreset: 'neon-noir',
  imageUrl: null,
  params: { duration: 6, aspectRatio: '16:9' },
};

describe('Health', () => {
  it('returns status and DB state', async () => {
    const res = await request.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe('connected');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request.get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('serves Swagger UI', async () => {
    const res = await request.get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger');
  });
});

describe('Auth', () => {
  it('registers, logs signup bonus, logs in and fetches /me', async () => {
    const { user, token, res } = await registerUser(request, { email: 'Jane@Example.com' });
    expect(res.status).toBe(201);
    expect(user.email).toBe('jane@example.com');
    expect(user.credits).toBe(20);
    expect(user.password).toBeUndefined();

    const tx = await CreditTransaction.find({ user: user._id }).lean();
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ reason: 'signup_bonus', amount: 20, balanceAfter: 20 });

    const login = await request.post('/api/v1/auth/login').send({ email: 'jane@example.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();

    const me = await request.get('/api/v1/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.credits).toBe(20);
  });

  it('rejects duplicate emails with 409', async () => {
    await registerUser(request, { email: 'dup@example.com' });
    const { res } = await registerUser(request, { email: 'dup@example.com' });
    expect(res.status).toBe(409);
  });

  it('rejects wrong password with 401', async () => {
    await registerUser(request, { email: 'a@example.com' });
    const res = await request.post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('enforces password rules', async () => {
    const { res } = await registerUser(request, { password: 'onlyletters' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing and invalid tokens', async () => {
    expect((await request.get('/api/v1/auth/me')).status).toBe(401);
    const res = await request.get('/api/v1/auth/me').set(auth('garbage'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('strips Mongo operators from input', async () => {
    const res = await request.post('/api/v1/auth/login').send({ email: { $gt: '' }, password: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('Catalog', () => {
  it('lists only enabled models without internals', async () => {
    const res = await request.get('/api/v1/models');
    expect(res.status).toBe(200);
    const keys = res.body.data.models.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['ltx-fast', 'kling-v3', 'seedance-i2v', 'flux-schnell']));
    expect(res.body.data.models[0].falModelId).toBeUndefined();
    expect(res.body.data.models[0].buildInput).toBeUndefined();
  });

  it('hides disabled models', async () => {
    const { setModelEnabled } = await import('../src/config/models.config.js');
    setModelEnabled('kling-v3', false);
    const res = await request.get('/api/v1/models');
    expect(res.body.data.models.map((m) => m.key)).not.toContain('kling-v3');
    setModelEnabled('kling-v3', true);
  });

  it('lists presets', async () => {
    const res = await request.get('/api/v1/presets');
    expect(res.body.data.camera.map((p) => p.key)).toContain('dolly-in');
    expect(res.body.data.style.map((p) => p.key)).toContain('neon-noir');
  });
});

describe('Generations', () => {
  it('creates a generation, debits credits and returns 202', async () => {
    const { token, user } = await registerUser(request);
    const res = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    expect(res.status).toBe(202);
    const gen = res.body.data.generation;
    expect(gen.status).toBe('processing');
    expect(gen.creditsCharged).toBe(2);
    expect(gen.enhancedPrompt).toContain('a lighthouse at dusk');
    expect(gen.outputPublicId).toBeUndefined();

    expect(falMock.queue.submit).toHaveBeenCalledWith('fal-ai/flux/schnell', {
      input: expect.objectContaining({ image_size: 'square_hd' }),
      webhookUrl: 'https://api.cinegen.test/api/v1/webhooks/fal',
    });
    const fresh = await User.findById(user._id);
    expect(fresh.credits).toBe(18);
    expect(fresh.dailyGenerationCount).toBe(1);
    const tx = await CreditTransaction.findOne({ reason: 'generation' }).lean();
    expect(tx).toMatchObject({ amount: -2, balanceAfter: 18 });
  });

  it('charges per second for video models', async () => {
    const { token, user } = await registerUser(request);
    await User.updateOne({ _id: user._id }, { credits: 100 });
    const res = await request.post('/api/v1/generations').set(auth(token)).send(videoGen);
    expect(res.status).toBe(202);
    expect(res.body.data.generation.creditsCharged).toBe(24);
    expect(res.body.data.generation.enhancedPrompt).toContain('dolly-in toward the subject');
    expect((await User.findById(user._id)).credits).toBe(76);
  });

  it('returns 402 on insufficient credits and does not call fal', async () => {
    const { token } = await registerUser(request);
    const res = await request.post('/api/v1/generations').set(auth(token)).send(videoGen);
    expect(res.status).toBe(402);
    expect(res.body.error).toEqual({ code: 'INSUFFICIENT_CREDITS', message: 'You need 24 credits but have 20.' });
    expect(falMock.queue.submit).not.toHaveBeenCalled();
  });

  it('never lets concurrent requests overspend', async () => {
    const { token, user } = await registerUser(request);
    await User.updateOne({ _id: user._id }, { credits: 5 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request.post('/api/v1/generations').set(auth(token)).send(imageGen)),
    );
    expect(results.filter((r) => r.status === 202)).toHaveLength(2);
    expect(results.filter((r) => r.status === 402)).toHaveLength(3);
    expect((await User.findById(user._id)).credits).toBe(1);
  });

  it('validates model/type/duration/aspect ratio/image', async () => {
    const { token } = await registerUser(request);
    const post = (body) => request.post('/api/v1/generations').set(auth(token)).send(body);
    expect((await post({ ...imageGen, modelKey: 'nope' })).status).toBe(400);
    expect((await post({ ...imageGen, type: 'text-to-video' })).status).toBe(400);
    expect((await post({ ...videoGen, params: { duration: 7 } })).status).toBe(400);
    expect((await post({ ...imageGen, params: { aspectRatio: '2:1' } })).status).toBe(400);
    const i2v = await post({ type: 'image-to-video', modelKey: 'seedance-i2v', prompt: 'make it move' });
    expect(i2v.status).toBe(400);
    expect(i2v.body.error.message).toContain('imageUrl');
    expect((await post({ ...imageGen, cameraPreset: 'bogus' })).status).toBe(400);
  });

  it('refunds credits when fal submission fails', async () => {
    falMock.queue.submit.mockRejectedValueOnce(new Error('fal down'));
    const { token, user } = await registerUser(request);
    const res = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    expect(res.status).toBe(202);
    expect(res.body.data.generation.status).toBe('failed');
    expect(res.body.data.generation.refunded).toBe(true);
    const fresh = await User.findById(user._id);
    expect(fresh.credits).toBe(20);
    expect(fresh.dailyGenerationCount).toBe(0);
    expect(await CreditTransaction.countDocuments({ reason: 'refund' })).toBe(1);
  });

  it('enforces the daily generation limit', async () => {
    const { token, user } = await registerUser(request);
    await User.updateOne({ _id: user._id }, { dailyGenerationCount: 10, dailyCountResetAt: new Date() });
    const res = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('DAILY_LIMIT_REACHED');
  });

  it('resets the daily counter on a new day', async () => {
    const { token, user } = await registerUser(request);
    await User.updateOne(
      { _id: user._id },
      { dailyGenerationCount: 10, dailyCountResetAt: new Date(Date.now() - 2 * 864e5) },
    );
    const res = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    expect(res.status).toBe(202);
  });

  it('lists own generations with pagination and filters', async () => {
    const { token } = await registerUser(request);
    const other = await registerUser(request);
    for (let i = 0; i < 3; i += 1) await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    await request.post('/api/v1/generations').set(auth(other.token)).send(imageGen);

    const res = await request.get('/api/v1/generations?limit=2&page=1').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.generations).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3 });

    const filtered = await request.get('/api/v1/generations?status=completed').set(auth(token));
    expect(filtered.body.meta.total).toBe(0);
    expect((await request.get('/api/v1/generations?limit=500').set(auth(token))).status).toBe(400);
  });

  it("returns 404 for other users' generations", async () => {
    const owner = await registerUser(request);
    const intruder = await registerUser(request);
    const created = await request.post('/api/v1/generations').set(auth(owner.token)).send(imageGen);
    const id = created.body.data.generation._id;

    expect((await request.get(`/api/v1/generations/${id}`).set(auth(owner.token))).status).toBe(200);
    expect((await request.get(`/api/v1/generations/${id}`).set(auth(intruder.token))).status).toBe(404);
    expect((await request.delete(`/api/v1/generations/${id}`).set(auth(intruder.token))).status).toBe(404);
    expect((await request.get('/api/v1/generations/not-an-id').set(auth(owner.token))).status).toBe(400);
  });

  it('only deletes finished generations and removes the Cloudinary asset', async () => {
    const { token } = await registerUser(request);
    const created = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    const { _id: id, falRequestId } = created.body.data.generation;

    expect((await request.delete(`/api/v1/generations/${id}`).set(auth(token))).status).toBe(409);

    await request
      .post('/api/v1/webhooks/fal')
      .send({ request_id: falRequestId, status: 'OK', payload: { images: [{ url: 'https://fal.media/x.png' }] } });
    const del = await request.delete(`/api/v1/generations/${id}`).set(auth(token));
    expect(del.status).toBe(200);
    expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith(
      'cinegen/outputs/out',
      expect.objectContaining({ resource_type: 'image' }),
    );
    expect(await Generation.countDocuments()).toBe(0);
  });

  it('uploads an input image', async () => {
    const { token } = await registerUser(request);
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
    const res = await request
      .post('/api/v1/generations/upload-image')
      .set(auth(token))
      .attach('image', png, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.imageUrl).toMatch(/^https:\/\/res\.cloudinary\.com/);
  });

  it('rejects non-image uploads', async () => {
    const { token } = await registerUser(request);
    const bad = await request
      .post('/api/v1/generations/upload-image')
      .set(auth(token))
      .attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);
    const spoofed = await request
      .post('/api/v1/generations/upload-image')
      .set(auth(token))
      .attach('image', Buffer.from('not really a png'), { filename: 'a.png', contentType: 'image/png' });
    expect(spoofed.status).toBe(400);
  });
});

describe('fal webhook', () => {
  const createVideo = async () => {
    const { token, user } = await registerUser(request);
    await User.updateOne({ _id: user._id }, { credits: 100 });
    const res = await request.post('/api/v1/generations').set(auth(token)).send(videoGen);
    return { token, user, gen: res.body.data.generation };
  };

  it('completes a generation and stores the output in Cloudinary', async () => {
    const { token, gen } = await createVideo();
    const res = await request
      .post('/api/v1/webhooks/fal')
      .send({ request_id: gen.falRequestId, status: 'OK', payload: { video: { url: 'https://fal.media/v.mp4' } } });
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('completed');
    expect(cloudinaryMock.uploader.upload).toHaveBeenCalledWith(
      'https://fal.media/v.mp4',
      expect.objectContaining({ resource_type: 'video' }),
    );

    const got = await request.get(`/api/v1/generations/${gen._id}`).set(auth(token));
    expect(got.body.data.generation).toMatchObject({
      status: 'completed',
      outputUrl: expect.stringContaining('res.cloudinary.com'),
    });
    expect(got.body.data.generation.completedAt).toBeTruthy();
    expect(got.body.data.generation.thumbnailUrl).toBeTruthy();
  });

  it('is idempotent for duplicate deliveries', async () => {
    const { user, gen } = await createVideo();
    const payload = {
      request_id: gen.falRequestId,
      status: 'OK',
      payload: { video: { url: 'https://fal.media/v.mp4' } },
    };
    await request.post('/api/v1/webhooks/fal').send(payload);
    const second = await request.post('/api/v1/webhooks/fal').send(payload);
    const errorAfter = await request
      .post('/api/v1/webhooks/fal')
      .send({ request_id: gen.falRequestId, status: 'ERROR', error: 'late' });
    expect(second.body.data.outcome).toBe('ignored');
    expect(errorAfter.body.data.outcome).toBe('ignored');
    expect(cloudinaryMock.uploader.upload).toHaveBeenCalledTimes(1);
    expect((await User.findById(user._id)).credits).toBe(76);
  });

  it('marks failed and refunds exactly once on error', async () => {
    const { user, gen } = await createVideo();
    const body = { request_id: gen.falRequestId, status: 'ERROR', error: 'NSFW content detected' };
    const results = await Promise.all([1, 2, 3].map(() => request.post('/api/v1/webhooks/fal').send(body)));
    expect(results.every((r) => r.status === 200)).toBe(true);

    const fresh = await Generation.findById(gen._id).lean();
    expect(fresh.status).toBe('failed');
    expect(fresh.errorMessage).toContain('NSFW');
    expect((await User.findById(user._id)).credits).toBe(100);
    expect(await CreditTransaction.countDocuments({ reason: 'refund' })).toBe(1);
  });

  it('fails + refunds when the payload has no output URL', async () => {
    const { user, gen } = await createVideo();
    const res = await request
      .post('/api/v1/webhooks/fal')
      .send({ request_id: gen.falRequestId, status: 'OK', payload: {} });
    expect(res.body.data.outcome).toBe('failed');
    expect((await User.findById(user._id)).credits).toBe(100);
  });

  it('ignores unknown request ids', async () => {
    const res = await request.post('/api/v1/webhooks/fal').send({ request_id: 'unknown', status: 'OK', payload: {} });
    expect(res.body.data.outcome).toBe('ignored');
  });
});

describe('fal webhook signature verification', () => {
  let verifyFalWebhook;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  beforeAll(async () => {
    const mod = await import('../src/services/webhook.service.js');
    verifyFalWebhook = mod.verifyFalWebhook;
    mod.__setJwksForTests([{ kty: 'OKP', crv: 'Ed25519', x: publicKey.export({ format: 'jwk' }).x }]);
  });

  const sign = (body, ts = Math.floor(Date.now() / 1000)) => {
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const msg = ['req-1', 'user-1', String(ts), hash].join('\n');
    return {
      'x-fal-webhook-request-id': 'req-1',
      'x-fal-webhook-user-id': 'user-1',
      'x-fal-webhook-timestamp': String(ts),
      'x-fal-webhook-signature': crypto.sign(null, Buffer.from(msg), privateKey).toString('hex'),
    };
  };

  it('accepts a valid signature', async () => {
    const body = Buffer.from('{"request_id":"req-1"}');
    expect(await verifyFalWebhook(sign(body), body)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const body = Buffer.from('{"request_id":"req-1"}');
    expect(await verifyFalWebhook(sign(body), Buffer.from('{"request_id":"req-2"}'))).toBe(false);
  });

  it('rejects stale timestamps and missing headers', async () => {
    const body = Buffer.from('{}');
    expect(await verifyFalWebhook(sign(body, Math.floor(Date.now() / 1000) - 3600), body)).toBe(false);
    expect(await verifyFalWebhook({}, body)).toBe(false);
  });
});

describe('Fallback poller', () => {
  it('completes jobs whose webhook was missed', async () => {
    const { token } = await registerUser(request);
    const created = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    const { _id: id } = created.body.data.generation;
    await Generation.collection.updateOne(
      { _id: Generation.castObject({ _id: id })._id },
      { $set: { createdAt: new Date(Date.now() - 2 * 60e3) } },
    );

    falMock.queue.status.mockResolvedValueOnce({ status: 'COMPLETED' });
    falMock.queue.result.mockResolvedValueOnce({
      data: { images: [{ url: 'https://fal.media/i.png' }] },
      requestId: 'x',
    });
    const { checked } = await generationService.pollPendingGenerations();
    expect(checked).toBe(1);
    expect((await Generation.findById(id)).status).toBe('completed');
  });

  it('times out + refunds jobs older than JOB_TIMEOUT_MINUTES', async () => {
    const { token, user } = await registerUser(request);
    const created = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    const { _id: id } = created.body.data.generation;
    await Generation.collection.updateOne(
      { _id: Generation.castObject({ _id: id })._id },
      { $set: { createdAt: new Date(Date.now() - 20 * 60e3) } },
    );

    falMock.queue.status.mockResolvedValueOnce({ status: 'IN_PROGRESS' });
    await generationService.pollPendingGenerations();
    const gen = await Generation.findById(id);
    expect(gen.status).toBe('failed');
    expect(gen.errorMessage).toContain('Timed out');
    expect((await User.findById(user._id)).credits).toBe(20);
  });

  it('refreshes a stale job when the client polls it (serverless fallback)', async () => {
    const { token } = await registerUser(request);
    const created = await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    const { _id: id } = created.body.data.generation;
    await Generation.collection.updateOne(
      { _id: Generation.castObject({ _id: id })._id },
      { $set: { createdAt: new Date(Date.now() - 2 * 60e3) } },
    );

    falMock.queue.status.mockResolvedValueOnce({ status: 'COMPLETED' });
    falMock.queue.result.mockResolvedValueOnce({ data: { images: [{ url: 'https://fal.media/i.png' }] } });
    const res = await request.get(`/api/v1/generations/${id}`).set(auth(token));
    expect(res.body.data.generation.status).toBe('completed');
  });

  it('protects the cron endpoint', async () => {
    expect((await request.get('/api/v1/internal/poll-jobs')).status).toBe(401);
    const res = await request.get('/api/v1/internal/poll-jobs').set(auth('cron-secret'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ checked: 0 });
  });
});

describe('Credits', () => {
  it('returns balance and history', async () => {
    const { token } = await registerUser(request);
    await request.post('/api/v1/generations').set(auth(token)).send(imageGen);
    const res = await request.get('/api/v1/credits').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(18);
    expect(res.body.data.transactions.map((t) => t.reason)).toEqual(['generation', 'signup_bonus']);
    expect(res.body.meta.total).toBe(2);
  });
});

describe('Admin', () => {
  it('blocks non-admins with 403', async () => {
    const { token } = await registerUser(request);
    for (const path of ['/users', '/generations', '/stats']) {
      expect((await request.get(`/api/v1/admin${path}`).set(auth(token))).status).toBe(403);
    }
  });

  it('grants and revokes credits', async () => {
    const admin = await makeAdmin(request);
    const { user, token } = await registerUser(request);

    const grant = await request
      .patch(`/api/v1/admin/users/${user._id}/credits`)
      .set(auth(admin.token))
      .send({ amount: 100, reason: 'beta' });
    expect(grant.status).toBe(200);
    expect(grant.body.data.user.credits).toBe(120);

    const tooMuch = await request
      .patch(`/api/v1/admin/users/${user._id}/credits`)
      .set(auth(admin.token))
      .send({ amount: -500 });
    expect(tooMuch.status).toBe(400);

    const revoke = await request
      .patch(`/api/v1/admin/users/${user._id}/credits`)
      .set(auth(admin.token))
      .send({ amount: -20 });
    expect(revoke.body.data.user.credits).toBe(100);

    const history = await request.get('/api/v1/credits').set(auth(token));
    expect(history.body.data.transactions.map((t) => t.reason)).toEqual([
      'admin_revoke',
      'admin_grant',
      'signup_bonus',
    ]);
  });

  it('deactivates users, which blocks them', async () => {
    const admin = await makeAdmin(request);
    const { user, token } = await registerUser(request);
    const res = await request
      .patch(`/api/v1/admin/users/${user._id}/status`)
      .set(auth(admin.token))
      .send({ isActive: false });
    expect(res.body.data.user.isActive).toBe(false);
    expect((await request.get('/api/v1/auth/me').set(auth(token))).status).toBe(403);
  });

  it('lists users with search, all generations, and stats', async () => {
    const admin = await makeAdmin(request);
    const { token } = await registerUser(request, { email: 'findme@example.com' });
    await request.post('/api/v1/generations').set(auth(token)).send(imageGen);

    const users = await request.get('/api/v1/admin/users?search=findme').set(auth(admin.token));
    expect(users.body.meta.total).toBe(1);
    expect(users.body.data.users[0].password).toBeUndefined();

    const gens = await request.get('/api/v1/admin/generations?status=processing').set(auth(admin.token));
    expect(gens.body.meta.total).toBe(1);
    expect(gens.body.data.generations[0].user.email).toBe('findme@example.com');

    const stats = await request.get('/api/v1/admin/stats').set(auth(admin.token));
    expect(stats.body.data.users.total).toBe(2);
    expect(stats.body.data.generations.byStatus.processing).toBe(1);
    expect(stats.body.data.credits.debited).toBe(2);
  });

  it('enables and disables models', async () => {
    const admin = await makeAdmin(request);
    const off = await request.patch('/api/v1/admin/models/kling-v3').set(auth(admin.token)).send({ enabled: false });
    expect(off.body.data.model.enabled).toBe(false);
    const { token, user } = await registerUser(request);
    await User.updateOne({ _id: user._id }, { credits: 500 });
    const res = await request
      .post('/api/v1/generations')
      .set(auth(token))
      .send({ ...videoGen, modelKey: 'kling-v3', params: { duration: 5 } });
    expect(res.status).toBe(400);
    await request.patch('/api/v1/admin/models/kling-v3').set(auth(admin.token)).send({ enabled: true });
  });
});
