import { CreditTransaction } from '../models/CreditTransaction.js';
import { sendSuccess, paginate } from '../utils/response.js';

export const getCredits = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { user: req.user._id };
  const [transactions, total] = await Promise.all([
    CreditTransaction.find(filter).sort('-createdAt').skip(skip).limit(limit).select('-__v -user').lean(),
    CreditTransaction.countDocuments(filter),
  ]);
  sendSuccess(res, { balance: req.user.credits, transactions }, { meta: { page, limit, total } });
};
