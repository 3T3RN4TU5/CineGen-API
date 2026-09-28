import mongoSanitize from 'express-mongo-sanitize';

/**
 * express-mongo-sanitize's middleware reassigns req.query, which Express 5 forbids,
 * so apply its sanitizer to each request part directly.
 */
export const sanitize = (req, _res, next) => {
  for (const key of ['body', 'params']) {
    if (req[key]) mongoSanitize.sanitize(req[key], { replaceWith: '_' });
  }
  if (req.query && Object.keys(req.query).length) {
    const clean = mongoSanitize.sanitize({ ...req.query }, { replaceWith: '_' });
    Object.defineProperty(req, 'query', { value: clean, writable: true, configurable: true, enumerable: true });
  }
  next();
};
