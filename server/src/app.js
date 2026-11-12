import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { operationsRoutes } from './routes/operations.js';
import { planRoutes } from './routes/plans.js';

/**
 * Builds the Express app. Dependencies are injected so tests can use the in-memory store and a
 * fake weather provider.
 */
export function createApp({ store, config, weather }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet({
    // OpenStreetMap's tile servers reject requests without a Referer, so send the origin only.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        connectSrc: ["'self'"],
        'upgrade-insecure-requests': null, // allow plain-http deployments behind a trusted proxy / localhost
      },
    },
  }));
  app.use(cors({ origin: config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
  }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', store: store.kind, time: new Date().toISOString() }));

  const auth = authenticate(config);
  app.use('/api/public', publicRoutes({ store, config, weather }));
  app.use('/api/auth', authRoutes({ store, config }));
  app.use('/api/plans', auth, planRoutes({ store, config, weather }));
  app.use('/api', auth, operationsRoutes({ store, config }));

  // Serve the built React app when present (production / docker).
  const dist = config.clientDist || path.resolve(import.meta.dirname, '../../client/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler(config.isProd));
  return app;
}
