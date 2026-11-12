import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/services/orchestrator.js';
import { createWeatherProvider } from '../src/services/weather.js';
import { seededStore, pipelineData } from './helpers.js';
import { REGIONS } from '../src/data/seed.js';

const deps = { weather: createWeatherProvider({}) };
const run = async (opts = {}, overrides = {}) => {
  const store = await seededStore();
  return runPipeline(await pipelineData(store, overrides), { weatherSource: 'sample', scenario: 'heavy-rain', ...opts }, deps);
};

// Acceptance test example: "Heavy Rainfall and Flood Risk"
test('heavy rainfall scenario produces a complete, data-supported plan', async () => {
  const r = await run();
  // retrieve weather + estimate risk levels
  assert.equal(r.risks.length, REGIONS.length);
  assert.ok(r.risks.every((x) => x.weather.rain24h > 0));
  const levels = Object.fromEntries(r.risks.map((x) => [x.regionCode, x.level]));
  assert.equal(levels.MAJ, 'high');
  assert.equal(levels.DHE, 'high');
  assert.equal(levels.JOR, 'medium');
  // identify vulnerable settlements + estimate population
  assert.ok(r.affected.length >= 4);
  assert.ok(r.totals.affectedExpected > 0);
  assert.ok(r.totals.affectedMin < r.totals.affectedExpected && r.totals.affectedExpected < r.totals.affectedMax);
  // food / water / medicine requirements and shortages
  for (const k of ['food', 'water', 'medicine']) {
    assert.ok(r.totals.required[k] > 0, `${k} required`);
    assert.ok(r.totals.shortage[k] >= 0);
  }
  // suppliers matched, routes generated
  assert.ok(r.allocations.length > 0);
  for (const a of r.allocations) {
    assert.ok(a.route.primary.edges.length > 0, 'route has road segments');
    assert.ok(a.route.primary.distanceKm > 0 && a.route.primary.etaHours > 0);
    assert.ok(a.route.primary.coords.length >= 2);
  }
  // shortage fully covered in demo data -> allocated equals shortage
  for (const k of ['food', 'water', 'medicine']) {
    assert.equal(r.totals.allocated[k] + r.totals.unresolved[k], r.totals.shortage[k], `${k} allocated + unresolved = shortage`);
  }
  // consolidated plan content + all agent stages ran
  assert.deepEqual(r.stages.map((s) => s.agent), ['RiskAgent', 'ExposureAgent', 'DemandAgent', 'RoutingAgent', 'SupplierAgent', 'CoordinatorAgent']);
  assert.ok(r.stages.every((s) => s.status === 'completed'));
  assert.ok(r.priorities.length > 0 && r.priorities[0].rank === 1);
  assert.match(r.narrative.text, /approved by an authorised person/);
  assert.match(r.meta.disclaimer, /not guaranteed/);
});

test('resource demand follows the configured formulas', async () => {
  const r = await run({ regionCodes: ['MAJ'] });
  const a = r.assumptions;
  const d = r.demand[0];
  assert.equal(d.required.food, Math.ceil(d.affectedExpected * a.foodKgPerPersonPerDay * a.planningDays));
  assert.equal(d.required.water, Math.ceil(d.affectedExpected * a.waterLPerPersonPerDay * a.planningDays));
  assert.equal(d.required.medicine, Math.ceil(d.affectedExpected * a.medicineKitsPerPerson));
  assert.equal(d.shortage.food, Math.max(0, d.required.food - d.local.food));
});

test('a blocked road triggers a reroute and names the closed segment', async () => {
  // Seed closures: E08 (Nagaon-Jorhat, Assam) and E20 (Muzaffarpur-Darbhanga, Bihar).
  // All regions compete for depot stock, so deliveries that would normally use those roads
  // are rerouted over alternative open roads.
  const r = await run();
  const rerouted = r.allocations.filter((a) => a.route.status === 'rerouted');
  for (const closed of ['E08', 'E20']) {
    const via = rerouted.filter((a) => a.route.avoided.some((s) => s.code === closed));
    assert.ok(via.length > 0, `seed closure ${closed} forces at least one reroute`);
    for (const a of via) {
      assert.ok(!a.route.primary.edges.includes(closed));
      assert.ok(a.route.baseline.edges.includes(closed));
    }
  }
  assert.ok(r.warnings.some((w) => w.code === 'ROUTE_REROUTED'));
});

test('moves nothing for dry conditions and says so', async () => {
  const r = await run({ scenario: 'dry' });
  assert.ok(r.risks.every((x) => x.level === 'low'));
  assert.equal(r.allocations.length, 0);
  assert.equal(r.totals.affectedExpected, 0);
  assert.ok(r.warnings.some((w) => w.code === 'NO_REGIONS_AT_RISK'));
});

test('incomplete weather is marked, never presented as a confirmed level', async () => {
  const r = await run({ scenario: 'incomplete-data' });
  const by = Object.fromEntries(r.risks.map((x) => [x.regionCode, x]));
  assert.equal(by.BAR.level, 'unavailable');
  assert.equal(by.BAR.score, null);
  assert.equal(by.MOR.incomplete, true);
  assert.equal(by.MOR.confidence, 'low');
  assert.ok(r.warnings.some((w) => w.code === 'RISK_UNAVAILABLE' && w.regionCode === 'BAR'));
  assert.ok(r.warnings.some((w) => w.code === 'RISK_INCOMPLETE' && w.regionCode === 'MOR'));
  assert.ok(!r.demand.some((d) => d.regionCode === 'BAR'), 'no demand is invented for a region with unavailable risk');
});

test('missing population data yields an uncertainty warning, not an invented estimate', async () => {
  const r = await run({ regionCodes: ['MOR'] });
  const e = r.affected[0];
  assert.equal(e.partial, true);
  assert.deepEqual(e.unknownSettlements, ['Bhuragaon']);
  const unknown = e.settlements.find((s) => s.name === 'Bhuragaon');
  assert.equal(unknown.expected, null);
  assert.ok(r.warnings.some((w) => w.code === 'PARTIAL_POPULATION_DATA'));

  // Region with no population data at all
  const store = await seededStore();
  const data = await pipelineData(store);
  data.regions.find((x) => x.code === 'MAJ').settlements.forEach((s) => { s.population = null; });
  const r2 = await runPipeline(data, { weatherSource: 'sample', scenario: 'heavy-rain', regionCodes: ['MAJ'] }, deps);
  assert.equal(r2.affected[0].available, false);
  assert.equal(r2.demand[0].available, false);
  assert.equal(r2.allocations.length, 0);
  assert.ok(r2.warnings.some((w) => w.code === 'NO_POPULATION_DATA' && w.level === 'critical'));
});

test('supplier records: negative stock excluded, stale stock flagged but usable', async () => {
  const r = await run();
  const invalid = r.supplierFlags.find((f) => f.supplierCode === 'SUP-KOK-01');
  assert.equal(invalid.usable, false);
  assert.ok(!r.allocations.some((a) => a.supplierCode === 'SUP-KOK-01'));
  const stale = r.supplierFlags.find((f) => f.supplierCode === 'SUP-MAN-01');
  assert.equal(stale.usable, true);
  assert.equal(stale.quality, 'stale');
});

test('insufficient supplier stock is reported as an unresolved shortage', async () => {
  const store = await seededStore();
  const data = await pipelineData(store);
  data.suppliers.forEach((s) => { s.inventory.water = Math.floor(s.inventory.water / 20); });
  const r = await runPipeline(data, { weatherSource: 'sample', scenario: 'heavy-rain' }, deps);
  assert.ok(r.unresolved.length > 0);
  assert.ok(r.unresolved.every((u) => u.amount > 0 && u.reason));
  assert.ok(r.warnings.some((w) => w.code === 'UNRESOLVED_SHORTAGE'));
  assert.equal(r.totals.allocated.water + r.totals.unresolved.water, r.totals.shortage.water);
});

test('supplier stock is never double-allocated across regions', async () => {
  const r = await run();
  const store = await seededStore();
  const suppliers = await store.suppliers.find();
  for (const s of suppliers) {
    for (const k of ['food', 'water', 'medicine']) {
      const used = r.allocations.filter((a) => a.supplierCode === s.code).reduce((n, a) => n + a.items[k], 0);
      // Invalid records (negative stock) are excluded from matching, so nothing may be drawn from them.
      const cap = Math.max(0, s.inventory[k]);
      assert.ok(used <= cap, `${s.code} ${k}: ${used} <= ${cap}`);
    }
  }
});

test('destination with no open route is marked inaccessible and flagged for manual intervention', async () => {
  const store = await seededStore();
  const data = await pipelineData(store);
  // Majuli is reachable only via the ferries E11 (from Jorhat) and E14 (from Dhemaji): close both.
  for (const e of data.edges) if (['E11', 'E14'].includes(e.code)) e.status = 'closed';
  const r = await runPipeline(data, { weatherSource: 'sample', scenario: 'heavy-rain', regionCodes: ['MAJ'] }, deps);
  assert.deepEqual(r.inaccessibleRegions, ['MAJ']);
  assert.equal(r.allocations.length, 0);
  assert.ok(r.unresolved.length > 0 && r.unresolved.every((u) => u.reason === 'NO_ACCESSIBLE_ROUTE'));
  assert.ok(r.warnings.some((w) => w.code === 'DESTINATION_INACCESSIBLE' && w.level === 'critical'));
});

test('unknown location is rejected with the list of valid regions', async () => {
  await assert.rejects(() => run({ regionCodes: ['XXX'] }), (e) => e.code === 'UNKNOWN_LOCATION' && e.details.valid.includes('MAJ'));
});
