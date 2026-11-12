import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { REGIONS } from '../src/data/seed.js';

let t;
let tokens = {};
before(async () => {
  t = await startApp();
  for (const role of ['admin', 'coordinator', 'logistics', 'viewer']) tokens[role] = await t.login(role);
});
after(() => t.close());

const newPlan = async (extra = {}) => {
  const r = await t.call('POST', '/api/plans', { token: tokens.coordinator, body: { weatherSource: 'sample', scenario: 'heavy-rain', ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.plan;
};

test('authentication: bad credentials rejected, protected routes need a token', async () => {
  const bad = await t.call('POST', '/api/auth/login', { body: { email: 'admin@climateguide.example', password: 'wrong' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'BAD_CREDENTIALS');
  assert.equal((await t.call('GET', '/api/plans')).status, 401);
  assert.equal((await t.call('GET', '/api/suppliers', { token: 'garbage' })).status, 401);
  const invalid = await t.call('POST', '/api/auth/login', { body: { email: 'not-an-email', password: 'x' } });
  assert.equal(invalid.status, 422);
});

test('public endpoints: risk, regions and road segments need no sign-in and hide sensitive data', async () => {
  const risk = await t.call('GET', '/api/public/risk?source=sample&scenario=heavy-rain');
  assert.equal(risk.status, 200);
  assert.equal(risk.body.risks.length, REGIONS.length);
  assert.match(risk.body.meta.disclaimer, /not guaranteed/);
  const regions = await t.call('GET', '/api/public/regions');
  assert.ok(regions.body.regions.every((r) => r.localInventory === undefined));
  assert.equal((await t.call('GET', '/api/public/risk?regions=ZZZ')).body.error.code, 'UNKNOWN_LOCATION');
  assert.equal((await t.call('GET', '/api/public/risk?scenario=nope')).status, 422);
  const pub = await t.call('GET', '/api/public/reports');
  assert.ok(pub.body.reports.every((r) => r.description === undefined), 'free-text descriptions are not public');
});

test('role-based access: suppliers are hidden from viewers; viewers cannot create plans', async () => {
  assert.equal((await t.call('GET', '/api/suppliers', { token: tokens.viewer })).status, 403);
  assert.equal((await t.call('GET', '/api/suppliers', { token: tokens.logistics })).status, 200);
  const plan = await t.call('POST', '/api/plans', { token: tokens.viewer, body: {} });
  assert.equal(plan.status, 403);
  assert.equal((await t.call('GET', '/api/plans', { token: tokens.viewer })).status, 200);
});

test('weather failure: live error is reported with a sample-data fallback hint (no silent fallback)', async () => {
  const failing = await startApp({ liveFails: true });
  const token = await failing.login('coordinator');
  const risk = await failing.call('GET', '/api/public/risk?source=live');
  assert.equal(risk.status, 502);
  assert.equal(risk.body.error.code, 'WEATHER_UNAVAILABLE');
  assert.equal(risk.body.error.details.canFallbackToSample, true);
  const plan = await failing.call('POST', '/api/plans', { token, body: { weatherSource: 'live' } });
  assert.equal(plan.status, 502);
  assert.equal((await failing.call('GET', '/api/plans', { token })).body.plans.length, 0, 'no plan was saved on failure');
  const sample = await failing.call('POST', '/api/plans', { token, body: { weatherSource: 'sample' } });
  assert.equal(sample.status, 201);
  await failing.close();
});

test('plan lifecycle: draft -> human approval -> tracked distribution', async () => {
  const plan = await newPlan({ title: 'Test plan' });
  assert.equal(plan.status, 'draft');
  assert.equal(plan.shipments.length, 0, 'nothing is dispatchable before approval');

  // cannot track shipments or dispatch on a draft
  assert.equal((await t.call('PATCH', `/api/plans/${plan.id}/shipments/S01`, { token: tokens.coordinator, body: { status: 'dispatched' } })).status, 409);

  // logistics and viewers cannot approve; approval needs explicit confirmation
  const body = { confirm: true };
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.logistics, body })).status, 403);
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.viewer, body })).status, 403);
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: {} })).status, 422);
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: { confirm: false } })).status, 422);

  // critical warnings (invalid supplier record) must be acknowledged
  const blocked = await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'WARNINGS_NOT_ACKNOWLEDGED');

  const approved = await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: { confirm: true, acknowledgeWarnings: true, note: 'Reviewed' } });
  assert.equal(approved.status, 200);
  const p = approved.body.plan;
  assert.equal(p.status, 'approved');
  assert.equal(p.approval.by.role, 'coordinator');
  assert.ok(p.shipments.length > 0 && p.shipments.every((s) => s.status === 'planned'));
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: { confirm: true, acknowledgeWarnings: true } })).status, 409, 'cannot approve twice');

  // distribution tracking with enforced transitions
  const sh = p.shipments[0];
  const url = `/api/plans/${plan.id}/shipments/${sh.id}`;
  const skip = await t.call('PATCH', url, { token: tokens.logistics, body: { status: 'delivered' } });
  assert.equal(skip.status, 409);
  assert.equal(skip.body.error.code, 'INVALID_TRANSITION');

  const supBefore = (await t.store.suppliers.findOne({ code: sh.supplierCode })).inventory;
  const disp = await t.call('PATCH', url, { token: tokens.logistics, body: { status: 'dispatched' } });
  assert.equal(disp.status, 200);
  assert.match(disp.body.notice, /No external notification was sent/);
  assert.equal(disp.body.plan.status, 'in_progress');
  const supAfter = (await t.store.suppliers.findOne({ code: sh.supplierCode })).inventory;
  assert.equal(supAfter.water, supBefore.water - sh.items.water, 'supplier stock reserved on dispatch');

  assert.equal((await t.call('PATCH', url, { token: tokens.logistics, body: { status: 'in_transit' } })).status, 200);
  const done = await t.call('PATCH', url, { token: tokens.logistics, body: { status: 'delivered' } });
  assert.equal(done.body.plan.shipments[0].history.length, 4);
  const failNoNote = await t.call('PATCH', `/api/plans/${plan.id}/shipments/${p.shipments[1].id}`, { token: tokens.logistics, body: { status: 'cancelled' } });
  assert.equal(failNoNote.status, 422);
});

test('plan can be rejected with a reason and then cannot be approved; drafts can be deleted', async () => {
  const plan = await newPlan();
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/reject`, { token: tokens.coordinator, body: {} })).status, 422);
  const rej = await t.call('POST', `/api/plans/${plan.id}/reject`, { token: tokens.coordinator, body: { note: 'Data looks wrong' } });
  assert.equal(rej.body.plan.status, 'rejected');
  assert.equal((await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: { confirm: true, acknowledgeWarnings: true } })).status, 409);
  const d = await newPlan();
  assert.equal((await t.call('DELETE', `/api/plans/${d.id}`, { token: tokens.coordinator })).status, 204);
  assert.equal((await t.call('GET', `/api/plans/${d.id}`, { token: tokens.coordinator })).status, 404);
});

test('stale plans cannot be approved', async () => {
  const plan = await newPlan();
  await t.store.plans.update(plan.id, { createdAt: new Date(Date.now() - 7 * 3600e3) });
  const r = await t.call('POST', `/api/plans/${plan.id}/approve`, { token: tokens.coordinator, body: { confirm: true, acknowledgeWarnings: true } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'PLAN_STALE');
});

test('unknown regions / validation errors are explained', async () => {
  const r = await t.call('POST', '/api/plans', { token: tokens.coordinator, body: { regionCodes: ['NOPE'] } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'UNKNOWN_LOCATION');
  assert.deepEqual(r.body.error.details.valid.sort(), REGIONS.map((r) => r.code).sort());
  const bad = await t.call('POST', '/api/plans', { token: tokens.coordinator, body: { weatherSource: 'satellite' } });
  assert.equal(bad.status, 422);
  assert.equal((await t.call('GET', '/api/plans/not-a-real-id', { token: tokens.coordinator })).status, 404);
});

test('emergency reports: validation, de-duplication and effect on routing', async () => {
  const report = { type: 'road_closure', regionCode: 'DHE', edgeCode: 'E13', severity: 4, description: 'Bridge approach flooded' };
  assert.equal((await t.call('POST', '/api/public/reports', { body: { ...report, edgeCode: undefined } })).status, 422, 'road closure needs a segment');
  assert.equal((await t.call('POST', '/api/public/reports', { body: { ...report, regionCode: 'NOPE' } })).status, 422);
  assert.equal((await t.call('POST', '/api/public/reports', { body: { ...report, edgeCode: 'E999' } })).status, 422);
  assert.equal((await t.call('POST', '/api/public/reports', { body: { ...report, severity: 9 } })).status, 422);

  const first = await t.call('POST', '/api/public/reports', { body: report });
  assert.equal(first.status, 201);
  assert.equal(first.body.duplicate, false);
  const dup = await t.call('POST', '/api/public/reports', { body: { ...report, severity: 5 } });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.duplicate, true);
  assert.equal(dup.body.report.reportCount, 2);
  assert.equal(dup.body.report.id, first.body.report.id);
  assert.equal((await t.store.reports.find({ dedupeKey: 'road_closure|E13|DHE' })).length, 1, 'only one stored report');

  // The closure now removes the only road into Dhemaji from the supplier side: plan must say so.
  const plan = await newPlan({ regionCodes: ['DHE'] });
  assert.ok(plan.result.warnings.some((w) => w.code === 'ROAD_CLOSED' && /Dibrugarh-Dhemaji/.test(w.message)));
  assert.ok(plan.result.allocations.every((a) => !a.route.primary.edges.includes('E13')));

  // staff can resolve it, and routing recovers
  const resolved = await t.call('PATCH', `/api/reports/${first.body.report.id}`, { token: tokens.coordinator, body: { status: 'resolved' } });
  assert.equal(resolved.body.report.status, 'resolved');
  assert.equal((await t.call('PATCH', `/api/reports/${first.body.report.id}`, { token: tokens.viewer, body: { status: 'resolved' } })).status, 403);
  const after = await newPlan({ regionCodes: ['DHE'] });
  assert.ok(!after.result.warnings.some((w) => w.code === 'ROAD_CLOSED' && /Dibrugarh-Dhemaji/.test(w.message)));
});

test('suppliers: inventory management, validation, and new suppliers join the road network', async () => {
  const create = await t.call('POST', '/api/suppliers', { token: tokens.logistics, body: { name: 'Test Depot', location: { lat: 26.5, lon: 93.5 }, inventory: { food: 100, water: 100, medicine: 5 } } });
  assert.equal(create.status, 201);
  const s = create.body.supplier;
  assert.equal(s.assessment.quality, 'ok');
  assert.equal(((await t.call('GET', '/api/roads', { token: tokens.viewer })).body.edges).filter((e) => e.autoGenerated && e.from === s.code).length, 2);
  assert.equal((await t.call('PATCH', `/api/suppliers/${s.id}/inventory`, { token: tokens.logistics, body: { food: -5, water: 1, medicine: 1 } })).status, 422);
  assert.equal((await t.call('PATCH', `/api/suppliers/${s.id}/inventory`, { token: tokens.logistics, body: { food: 7, water: 8, medicine: 9 } })).body.supplier.inventory.food, 7);
  assert.equal((await t.call('PATCH', `/api/suppliers/${s.id}/inventory`, { token: tokens.viewer, body: { food: 1, water: 1, medicine: 1 } })).status, 403);
  assert.equal((await t.call('DELETE', `/api/suppliers/${s.id}`, { token: tokens.logistics })).status, 403);
  assert.equal((await t.call('DELETE', `/api/suppliers/${s.id}`, { token: tokens.admin })).status, 204);
  assert.equal(((await t.call('GET', '/api/roads', { token: tokens.viewer })).body.edges).filter((e) => e.from === s.code).length, 0);
});

test('assumptions are configurable, validated, and recorded in each plan', async () => {
  const cur = (await t.call('GET', '/api/settings/assumptions', { token: tokens.viewer })).body.assumptions;
  assert.equal((await t.call('PUT', '/api/settings/assumptions', { token: tokens.viewer, body: cur })).status, 403);
  assert.equal((await t.call('PUT', '/api/settings/assumptions', { token: tokens.admin, body: { ...cur, riskThresholds: { medium: 0.6, high: 0.5 } } })).status, 422);
  const changed = { ...cur, waterLPerPersonPerDay: 10, planningDays: 1 };
  assert.equal((await t.call('PUT', '/api/settings/assumptions', { token: tokens.admin, body: changed })).status, 200);
  const plan = await newPlan({ regionCodes: ['MAJ'] });
  assert.equal(plan.result.assumptions.waterLPerPersonPerDay, 10);
  const d = plan.result.demand[0];
  assert.equal(d.required.water, Math.ceil(d.affectedExpected * 10));
  await t.call('PUT', '/api/settings/assumptions', { token: tokens.admin, body: cur });
});

test('dashboard summary and audit trail reflect activity', async () => {
  const s = await t.call('GET', '/api/dashboard/summary', { token: tokens.viewer });
  assert.equal(s.status, 200);
  assert.ok(s.body.planCount > 0);
  assert.ok(s.body.flaggedSuppliers >= 2);
  const audit = await t.call('GET', '/api/audit', { token: tokens.coordinator });
  assert.ok(audit.body.entries.some((e) => e.action === 'plan.approve'));
  assert.equal((await t.call('GET', '/api/audit', { token: tokens.viewer })).status, 403);
});
