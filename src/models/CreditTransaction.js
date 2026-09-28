import mongoose from 'mongoose';

export const CREDIT_REASONS = ['signup_bonus', 'generation', 'refund', 'admin_grant', 'admin_revoke'];

const creditTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    reason: { type: String, enum: CREDIT_REASONS, required: true },
    note: { type: String, maxlength: 200 },
    generation: { type: mongoose.Schema.Types.ObjectId, ref: 'Generation' },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: true },
);

creditTransactionSchema.index({ user: 1, createdAt: -1 });
// A generation can be refunded at most once — the DB enforces it.
creditTransactionSchema.index(
  { generation: 1, reason: 1 },
  { unique: true, partialFilterExpression: { reason: 'refund' } },
);

export const CreditTransaction =
  mongoose.models.CreditTransaction || mongoose.model('CreditTransaction', creditTransactionSchema);
