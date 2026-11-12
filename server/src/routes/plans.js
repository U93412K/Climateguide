import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { runPipeline } from '../services/orchestrator.js';
import { RESOURCES } from '../services/demand.js';
import { loadData, sourceSchema, scenarioSchema } from './helpers.js';

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  regionCodes: z.array(z.string().trim().toUpperCase().min(2).max(10)).max(50).optional(),
  weatherSource: sourceSchema,
  scenario: scenarioSchema,
});
const approveSchema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'must be true: explicit confirmation is required before approval' }) }),
  acknowledgeWarnings: z.boolean().optional().default(false),
  note: z.string().trim().max(500).optional().default(''),
});
const rejectSchema = z.object({ note: z.string().trim().min(3, 'a reason is required').max(500) });
const shipmentSchema = z.object({
  status: z.enum(['dispatched', 'in_transit', 'delivered', 'failed', 'cancelled']),
  note: z.string().trim().max(300).optional().default(''),
});

const TRANSITIONS = {
  planned: ['dispatched', 'cancelled'],
  dispatched: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [], failed: [], cancelled: [],
};

const summary = (p) => ({
  id: p.id, number: p.number, title: p.title, status: p.status, createdAt: p.createdAt, createdBy: p.createdBy, params: p.params,
  approval: p.approval,
  headline: p.result && {
    high: p.result.risks.filter((x) => x.level === 'high').length,
    medium: p.result.risks.filter((x) => x.level === 'medium').length,
    affectedExpected: p.result.totals.affectedExpected,
    deliveries: p.result.allocations.length,
    unresolved: p.result.unresolved.length,
    critical: p.result.warnings.filter((w) => w.level === 'critical').length,
  },
});

export function planRoutes({ store, config, weather }) {
  const r = Router();
  const audit = (req, action, details) => store.audit.insert({ action, user: { id: req.user.id, name: req.user.name, role: req.user.role }, details, at: new Date() });
  const load = async (id) => {
    const p = await store.plans.findById(id);
    if (!p) throw notFound('Plan');
    return p;
  };

  r.get('/', asyncHandler(async (_req, res) => {
    const plans = await store.plans.find({}, { sort: { createdAt: -1 }, limit: 100 });
    res.json({ plans: plans.map(summary) });
  }));

  r.get('/:id', asyncHandler(async (req, res) => res.json({ plan: await load(req.params.id) })));

  // Generate a new DRAFT plan. Nothing is dispatched; a human must approve it.
  r.post('/', requireRole('admin', 'coordinator', 'logistics'), validate(createSchema), asyncHandler(async (req, res) => {
    const data = await loadData(store);
    const { weatherSource, scenario } = req.body;
    let result;
    try {
      result = await runPipeline(data, { regionCodes: req.body.regionCodes, weatherSource, scenario }, {
        weather,
        narrative: { apiKey: config.anthropicKey, model: config.anthropicModel },
      });
    } catch (err) {
      if (err instanceof AppError && ['WEATHER_UNAVAILABLE', 'WEATHER_NOT_CONFIGURED'].includes(err.code)) {
        err.details = { canFallbackToSample: true };
      }
      throw err;
    }
    const number = `PLAN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const plan = await store.plans.insert({
      number, title: req.body.title || `Response plan ${new Date().toLocaleDateString('en-GB')}`,
      status: 'draft', params: { regionCodes: result.meta.regionCodes, weatherSource, scenario: result.meta.scenario },
      createdBy: { id: req.user.id, name: req.user.name, role: req.user.role },
      result, approval: null, shipments: [],
    });
    await audit(req, 'plan.create', { number, weatherSource });
    res.status(201).json({ plan });
  }));

  r.delete('/:id', requireRole('admin', 'coordinator'), asyncHandler(async (req, res) => {
    const plan = await load(req.params.id);
    if (plan.status !== 'draft') throw new AppError(409, 'PLAN_NOT_DRAFT', 'Only draft plans can be deleted.');
    await store.plans.remove(plan.id);
    await audit(req, 'plan.delete', { number: plan.number });
    res.status(204).end();
  }));

  // Human approval gate: explicit confirmation, role check, freshness check.
  r.post('/:id/approve', requireRole('admin', 'coordinator'), validate(approveSchema), asyncHandler(async (req, res) => {
    const plan = await load(req.params.id);
    if (plan.status !== 'draft') throw new AppError(409, 'PLAN_NOT_DRAFT', `This plan is already ${plan.status}.`);
    const ageHours = (Date.now() - new Date(plan.createdAt).getTime()) / 3600000;
    if (ageHours > config.planMaxAgeHours) {
      throw new AppError(409, 'PLAN_STALE', `This plan is ${Math.floor(ageHours)} h old and its weather, stock and road data may have changed. Generate a fresh plan.`);
    }
    const critical = plan.result.warnings.filter((w) => w.level === 'critical');
    if (critical.length && !req.body.acknowledgeWarnings) {
      throw new AppError(409, 'WARNINGS_NOT_ACKNOWLEDGED', `This plan has ${critical.length} critical warning(s). Review them and confirm you acknowledge them to approve.`, { critical });
    }
    const now = new Date();
    const shipments = plan.result.allocations.map((a, i) => ({
      id: `S${String(i + 1).padStart(2, '0')}`, allocationId: a.id, supplierCode: a.supplierCode, supplierName: a.supplierName,
      regionCode: a.regionCode, destinationName: a.destinationName, items: a.items,
      distanceKm: a.route.primary.distanceKm, etaHours: a.route.primary.etaHours, routeStatus: a.route.status, priorityRank: a.priorityRank,
      status: 'planned', inventoryDeducted: false, history: [{ status: 'planned', at: now, by: req.user.name, note: 'Created on plan approval' }],
    }));
    const approval = { by: { id: req.user.id, name: req.user.name, role: req.user.role }, at: now, note: req.body.note, acknowledgedWarnings: critical.length };
    const updated = await store.plans.update(plan.id, { status: 'approved', approval, shipments });
    await audit(req, 'plan.approve', { number: plan.number, shipments: shipments.length });
    res.json({ plan: updated });
  }));

  r.post('/:id/reject', requireRole('admin', 'coordinator'), validate(rejectSchema), asyncHandler(async (req, res) => {
    const plan = await load(req.params.id);
    if (plan.status !== 'draft') throw new AppError(409, 'PLAN_NOT_DRAFT', `This plan is already ${plan.status}.`);
    const approval = { by: { id: req.user.id, name: req.user.name, role: req.user.role }, at: new Date(), note: req.body.note, rejected: true };
    const updated = await store.plans.update(plan.id, { status: 'rejected', approval });
    await audit(req, 'plan.reject', { number: plan.number });
    res.json({ plan: updated });
  }));

  // Track relief distribution. This only RECORDS status inside ClimateGuide; it contacts no one.
  r.patch('/:id/shipments/:shipmentId', requireRole('admin', 'coordinator', 'logistics'), validate(shipmentSchema), asyncHandler(async (req, res) => {
    const plan = await load(req.params.id);
    if (!['approved', 'in_progress'].includes(plan.status)) throw new AppError(409, 'PLAN_NOT_APPROVED', 'Shipments can only be tracked on approved plans.');
    const shipments = structuredClone(plan.shipments);
    const sh = shipments.find((s) => s.id === req.params.shipmentId);
    if (!sh) throw notFound('Shipment');
    const next = req.body.status;
    if (!TRANSITIONS[sh.status].includes(next)) throw new AppError(409, 'INVALID_TRANSITION', `A shipment that is "${sh.status}" cannot move to "${next}".`);
    if (['failed', 'cancelled'].includes(next) && !req.body.note) throw new AppError(422, 'NOTE_REQUIRED', 'Please add a note explaining why.');

    if (next === 'dispatched') {
      // Reserve supplier stock at dispatch, but only if it is still there.
      const sup = await store.suppliers.findOne({ code: sh.supplierCode });
      if (!sup) throw new AppError(409, 'SUPPLIER_MISSING', 'This supplier no longer exists. Re-plan this delivery.');
      const short = RESOURCES.filter((k) => (sup.inventory[k] ?? 0) < sh.items[k]);
      if (short.length) throw new AppError(409, 'INSUFFICIENT_INVENTORY', `Supplier stock has changed and no longer covers this shipment (${short.join(', ')}). Update inventory or re-plan.`);
      const inventory = Object.fromEntries(RESOURCES.map((k) => [k, sup.inventory[k] - sh.items[k]]));
      await store.suppliers.update(sup.id, { inventory, inventoryUpdatedAt: new Date() });
      sh.inventoryDeducted = true;
    }
    sh.status = next;
    sh.history.push({ status: next, at: new Date(), by: req.user.name, note: req.body.note });

    const states = shipments.map((s) => s.status);
    const planStatus = states.every((s) => ['delivered', 'failed', 'cancelled'].includes(s)) ? 'completed'
      : states.some((s) => s !== 'planned') ? 'in_progress' : 'approved';
    const updated = await store.plans.update(plan.id, { shipments, status: planStatus });
    await audit(req, 'shipment.status', { plan: plan.number, shipment: sh.id, status: next });
    res.json({ plan: updated, notice: next === 'dispatched' ? 'Status recorded in ClimateGuide and supplier stock reserved. No external notification was sent: contact the supplier directly.' : undefined });
  }));

  return r;
}
