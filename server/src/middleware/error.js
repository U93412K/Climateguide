import { AppError } from '../lib/errors.js';

export const notFoundHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (isProd) => (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: isProd ? 'Something went wrong.' : String(err?.message || err) } });
};
