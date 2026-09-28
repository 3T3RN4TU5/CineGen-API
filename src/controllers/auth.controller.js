import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';
import { toPublicUser } from '../utils/serialize.js';
import { signToken } from '../middleware/auth.js';
import { logSignupBonus } from '../services/credit.service.js';

export const register = async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists.');
  const user = await User.create({ name, email, password });
  await logSignupBonus(user);
  sendSuccess(res, { user: toPublicUser(user), token: signToken(user) }, { status: 201 });
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  if (!user.isActive) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Your account is disabled.');
  sendSuccess(res, { user: toPublicUser(user), token: signToken(user) });
};

export const me = (req, res) => sendSuccess(res, { user: toPublicUser(req.user) });
