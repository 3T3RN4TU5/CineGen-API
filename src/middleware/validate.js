import { ApiError } from '../utils/ApiError.js';

/**
 * Validates `req[source]` against a Zod schema and replaces it with the parsed value.
 * @param {import('zod').ZodType} schema
 * @param {'body'|'query'|'params'} [source]
 */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(
        ApiError.badRequest(details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; '), details),
      );
    }
    // Express 5 exposes req.query as a getter, so redefine it rather than assign.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true, enumerable: true });
    next();
  };
