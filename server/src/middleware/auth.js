import jwt from 'jsonwebtoken';
import { AppError } from '../lib/errors.js';

export const ROLES = ['admin', 'coordinator', 'logistics', 'viewer'];

export const signToken = (user, config) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const authenticate = (config) => (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired. Please sign in again.'));
  }
};

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new AppError(403, 'FORBIDDEN', `This action requires one of these roles: ${roles.join(', ')}.`));
