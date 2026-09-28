import { Generation } from '../models/Generation.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, paginate } from '../utils/response.js';
import { toPublicGeneration } from '../utils/serialize.js';
import { createGeneration, getOwnGeneration, deleteOwnGeneration } from '../services/generation.service.js';
import { uploadBuffer } from '../services/storage.service.js';
import { assertImageSignature } from '../middleware/upload.js';

export const create = async (req, res) => {
  const generation = await createGeneration(req.user, req.body);
  sendSuccess(res, { generation: toPublicGeneration(generation) }, { status: 202 });
};

export const uploadImage = async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required (field name "image").');
  assertImageSignature(req.file.buffer);
  const { url } = await uploadBuffer(req.file.buffer);
  sendSuccess(res, { imageUrl: url }, { status: 201 });
};

export const list = async (req, res) => {
  const { status, type, sort } = req.query;
  const { page, limit, skip } = paginate(req.query);
  const filter = { user: req.user._id, ...(status && { status }), ...(type && { type }) };
  const [items, total] = await Promise.all([
    Generation.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Generation.countDocuments(filter),
  ]);
  sendSuccess(res, { generations: items.map(toPublicGeneration) }, { meta: { page, limit, total } });
};

export const getOne = async (req, res) => {
  const generation = await getOwnGeneration(req.user._id, req.params.id);
  sendSuccess(res, { generation: toPublicGeneration(generation) });
};

export const remove = async (req, res) => {
  await deleteOwnGeneration(req.user._id, req.params.id);
  sendSuccess(res, { deleted: true });
};
