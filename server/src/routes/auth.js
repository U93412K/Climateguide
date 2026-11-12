import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { authenticate, signToken } from '../middleware/auth.js';

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// Pre-computed hash so unknown emails take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function authRoutes({ store, config }) {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.' } },
  });

  r.post('/login', limiter, validate(loginSchema), asyncHandler(async (req, res) => {
    const user = await store.users.findOne({ email: req.body.email });
    const ok = await bcrypt.compare(req.body.password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password.');
    res.json({ token: signToken(user, config), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }));

  r.get('/me', authenticate(config), asyncHandler(async (req, res) => {
    const user = await store.users.findById(req.user.id);
    if (!user) throw new AppError(401, 'INVALID_TOKEN', 'Account no longer exists.');
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }));

  return r;
}
