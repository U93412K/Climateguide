import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/** validate(schema, 'body' | 'query') parses and replaces the request part with the clean value. */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  try {
    req[part] = schema.parse(req[part] ?? {});
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new AppError(422, 'VALIDATION_ERROR', `Invalid input: ${issues.map((i) => `${i.field || 'value'} ${i.message}`).join('; ')}`, issues));
    }
    next(err);
  }
};

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
