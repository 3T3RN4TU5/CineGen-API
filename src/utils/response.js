/** Sends the standard success envelope. */
export const sendSuccess = (res, data, { status = 200, meta } = {}) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

/** Parses page/limit query values into skip/limit with a hard cap. */
export const paginate = ({ page = 1, limit = 10 } = {}, maxLimit = 50) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(maxLimit, Math.max(1, Number(limit) || 10));
  return { page: p, limit: l, skip: (p - 1) * l };
};
