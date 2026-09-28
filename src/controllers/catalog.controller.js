import { getEnabledModels, toPublicModel } from '../config/models.config.js';
import { listPresets } from '../config/presets.config.js';
import { sendSuccess } from '../utils/response.js';

export const listModels = (req, res) => {
  const { type } = req.query;
  const models = getEnabledModels()
    .filter((m) => !type || m.type === type)
    .map(toPublicModel);
  sendSuccess(res, { models });
};

export const listAllPresets = (_req, res) => sendSuccess(res, listPresets());
