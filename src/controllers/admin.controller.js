import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Generation } from '../models/Generation.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, paginate } from '../utils/response.js';
import { toPublicGeneration, toPublicUser } from '../utils/serialize.js';
import { adjustCredits } from '../services/credit.service.js';
import { MODELS, isEnabled, setModelEnabled, toPublicModel } from '../config/models.config.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listUsers = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = req.query.search ? { email: { $regex: escapeRegex(req.query.search), $options: 'i' } } : {};
  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  sendSuccess(res, { users: users.map(toPublicUser) }, { meta: { page, limit, total } });
};

export const updateCredits = async (req, res) => {
  const user = await adjustCredits({ userId: req.params.id, amount: req.body.amount, note: req.body.reason });
  sendSuccess(res, { user: toPublicUser(user) });
};

export const updateStatus = async (req, res) => {
  if (String(req.user._id) === req.params.id && !req.body.isActive) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: req.body.isActive },
    { returnDocument: 'after' },
  );
  if (!user) throw ApiError.notFound('User not found');
  sendSuccess(res, { user: toPublicUser(user) });
};

export const listGenerations = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, user, type } = req.query;
  const filter = { ...(status && { status }), ...(user && { user }), ...(type && { type }) };
  const [items, total] = await Promise.all([
    Generation.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('user', 'name email').lean(),
    Generation.countDocuments(filter),
  ]);
  sendSuccess(res, { generations: items.map(toPublicGeneration) }, { meta: { page, limit, total } });
};

export const stats = async (_req, res) => {
  const [users, activeUsers, byStatus, byModel, spent] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Generation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Generation.aggregate([{ $group: { _id: '$modelKey', count: { $sum: 1 } } }]),
    CreditTransaction.aggregate([
      { $match: { reason: { $in: ['generation', 'refund'] } } },
      { $group: { _id: '$reason', total: { $sum: '$amount' } } },
    ]),
  ]);
  const toMap = (rows, field = 'count') => Object.fromEntries(rows.map((r) => [r._id, r[field]]));
  const spentMap = toMap(spent, 'total');
  const generationsByStatus = { queued: 0, processing: 0, completed: 0, failed: 0, ...toMap(byStatus) };
  sendSuccess(res, {
    users: { total: users, active: activeUsers },
    generations: {
      total: Object.values(generationsByStatus).reduce((a, b) => a + b, 0),
      byStatus: generationsByStatus,
      byModel: toMap(byModel),
    },
    credits: {
      debited: Math.abs(spentMap.generation ?? 0),
      refunded: spentMap.refund ?? 0,
      netSpent: Math.abs(spentMap.generation ?? 0) - (spentMap.refund ?? 0),
    },
    db: mongoose.connection.name,
  });
};

export const listModels = (_req, res) =>
  sendSuccess(res, {
    models: MODELS.map((m) => ({ ...toPublicModel(m), falModelId: m.falModelId, enabled: isEnabled(m) })),
  });

export const toggleModel = (req, res) => {
  const model = setModelEnabled(req.params.key, req.body.enabled);
  if (!model) throw ApiError.notFound('Model not found');
  sendSuccess(res, { model: { ...toPublicModel(model), enabled: isEnabled(model) } });
};
