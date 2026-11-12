import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { assessRegionRisk } from '../services/risk.js';
import { SCENARIOS } from '../services/weather.js';
import { submitReport } from '../services/reports.js';
import { DEMO_USERS } from '../data/seed.js';
import { loadData, sourceSchema, scenarioSchema, reportInputSchema, redactReport } from './helpers.js';

/** Endpoints for the general public (no sign-in): read-only risk info and incident reporting. */
export function publicRoutes({ store, config, weather }) {
  const r = Router();

  const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many reports from this connection. Please try again later.' } },
  });

  r.get('/config', (_req, res) => {
    res.json({
      appName: 'ClimateGuide',
      store: store.kind,
      liveWeatherAvailable: weather.liveAvailable,
      aiNarrativeAvailable: !!config.anthropicKey,
      scenarios: Object.entries(SCENARIOS).map(([id, s]) => ({ id, label: s.label })),
      demo: !config.isProd && config.usingDemoPassword,
      ...(!config.isProd && config.usingDemoPassword && {
        demoAccounts: DEMO_USERS.map((u) => ({ role: u.role, email: u.email })),
        demoPassword: config.seedPassword,
      }),
    });
  });

  r.get('/regions', asyncHandler(async (_req, res) => {
    const regions = await store.regions.find();
    res.json({ regions: regions.map(({ localInventory, ...rest }) => rest) });
  }));

  const riskQuery = z.object({
    source: sourceSchema,
    scenario: scenarioSchema,
    regions: z.string().optional(),
  });

  r.get('/risk', validate(riskQuery, 'query'), asyncHandler(async (req, res) => {
    const { source, scenario } = req.query;
    const data = await loadData(store);
    const codes = req.query.regions ? req.query.regions.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) : data.regions.map((x) => x.code);
    const bad = codes.filter((c) => !data.regions.some((x) => x.code === c));
    if (bad.length) throw new AppError(422, 'UNKNOWN_LOCATION', `Unknown region(s): ${bad.join(', ')}. Please select a valid location.`, { valid: data.regions.map((x) => x.code) });
    const now = new Date();
    const active = data.reports.filter((x) => x.status === 'active');
    let risks;
    try {
      risks = await Promise.all(
        data.regions.filter((x) => codes.includes(x.code)).map(async (region) => {
          const wx = await weather.get(region, { source, scenario, now });
          return assessRegionRisk(region, wx, active, data.assumptions);
        }),
      );
    } catch (err) {
      if (err instanceof AppError && ['WEATHER_UNAVAILABLE', 'WEATHER_NOT_CONFIGURED'].includes(err.code)) {
        err.details = { canFallbackToSample: true };
      }
      throw err;
    }
    res.json({
      meta: { generatedAt: now.toISOString(), weatherSource: source, scenario: source === 'sample' ? scenario : null,
        disclaimer: 'Risk levels are model estimates, not guaranteed outcomes. Follow official local authority advice.' },
      risks,
    });
  }));

  r.get('/road-segments', asyncHandler(async (_req, res) => {
    const edges = await store.edges.find();
    res.json({ segments: edges.map((e) => ({ code: e.code, name: e.name })) });
  }));

  r.get('/reports', asyncHandler(async (_req, res) => {
    const list = await store.reports.find({ status: 'active' }, { sort: { reportedAt: -1 }, limit: 50 });
    res.json({ reports: list.map(redactReport) });
  }));

  r.post('/reports', reportLimiter, validate(reportInputSchema), asyncHandler(async (req, res) => {
    const data = await loadData(store);
    if (!data.regions.some((x) => x.code === req.body.regionCode)) throw new AppError(422, 'UNKNOWN_LOCATION', 'Please select a valid location.');
    if (req.body.edgeCode && !data.edges.some((e) => e.code === req.body.edgeCode)) throw new AppError(422, 'UNKNOWN_ROAD', 'Please select a valid road segment.');
    const { report, duplicate } = await submitReport(store, req.body, data.assumptions, new Date(), 'public');
    res.status(duplicate ? 200 : 201).json({
      duplicate,
      message: duplicate
        ? 'A matching report already exists, so yours was added to it instead of creating a duplicate.'
        : 'Thank you. Your report was recorded and will be reviewed by coordinators. For emergencies, call your local emergency number.',
      report: redactReport(report),
    });
  }));

  return r;
}
