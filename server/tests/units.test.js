import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm } from '../src/lib/geo.js';
import { assessRegionRisk, classify, rainfallCategory } from '../src/services/risk.js';
import { buildGraph, planRoute } from '../src/services/routing.js';
import { assessSupplier } from '../src/services/suppliers.js';
import { findDuplicate } from '../src/services/reports.js';
import { normaliseOpenWeather, createWeatherProvider } from '../src/services/weather.js';
import { buildNarrative, templateNarrative } from '../src/services/narrative.js';
import { DEFAULT_ASSUMPTIONS, REGIONS, buildSuppliers, NODES_FROM, buildEdges, dedupeKeyOf } from '../src/data/seed.js';

const A = DEFAULT_ASSUMPTIONS;
const region = REGIONS.find((r) => r.code === 'MAJ');

test('haversine: Guwahati to Jorhat is roughly 256 km as the crow flies', () => {
  const d = haversineKm({ lat: 26.14, lon: 91.74 }, { lat: 26.75, lon: 94.22 });
  assert.ok(d > 250 && d < 262, `got ${d}`);
});

test('risk: more rain gives a higher score; thresholds classify', () => {
  const wx = (r24, r72) => ({ source: 'sample', rain24h: r24, rain72h: r72, humidity: 90, temperatureC: 25 });
  const low = assessRegionRisk(region, wx(5, 10), [], A);
  const high = assessRegionRisk(region, wx(150, 280), [], A);
  assert.ok(high.score > low.score);
  assert.equal(low.level, 'low');
  assert.equal(high.level, 'high');
  assert.equal(classify(0.3, A.riskThresholds), 'medium');
  assert.equal(classify(0.55, A.riskThresholds), 'high');
  assert.equal(rainfallCategory(120), 'very heavy');
});

test('risk: active flood reports raise the score; missing rain gives "unavailable"', () => {
  const wx = { source: 'sample', rain24h: 60, rain72h: 100, humidity: 80, temperatureC: 25 };
  const base = assessRegionRisk(region, wx, [], A);
  const withReports = assessRegionRisk(region, wx, [{ regionCode: 'MAJ', type: 'flooding', duplicateCount: 2 }], A);
  assert.ok(withReports.score > base.score);
  const none = assessRegionRisk(region, { source: 'live', rain24h: null }, [], A);
  assert.equal(none.level, 'unavailable');
});

const nodes = () => NODES_FROM(REGIONS, buildSuppliers());
const graphWith = (reports = [], mutate = (e) => e) => buildGraph(nodes(), buildEdges(nodes()).map(mutate), reports);

test('routing: open network gives a direct, ok route', () => {
  const route = planRoute(graphWith(), 'SUP-DIB-01', 'R-DHE');
  assert.equal(route.status, 'ok');
  assert.deepEqual(route.primary.edges, ['E13']);
});

test('routing: a closure report forces an alternative; closing everything makes it inaccessible', () => {
  const g = graphWith([{ type: 'road_closure', edgeCode: 'E08', severity: 4, status: 'active' }]);
  const route = planRoute(g, 'SUP-NAG-01', 'SUP-JOR-01');
  assert.equal(route.status, 'rerouted');
  assert.ok(!route.primary.edges.includes('E08'));
  assert.ok(route.primary.etaHours > route.baseline.etaHours);

  const g2 = graphWith([], (e) => (['E08', 'E09'].includes(e.code) ? { ...e, status: 'closed' } : e));
  const blocked = planRoute(g2, 'SUP-NAG-01', 'SUP-JOR-01');
  assert.equal(blocked.status, 'inaccessible');
  assert.equal(blocked.reason, 'ALL_ROUTES_BLOCKED');
  assert.ok(blocked.avoided.length > 0);
});

test('routing: flooding report degrades (slows) a segment without closing it', () => {
  const g = graphWith([{ type: 'flooding', edgeCode: 'E13', severity: 3, status: 'active' }]);
  const route = planRoute(g, 'SUP-DIB-01', 'R-DHE');
  assert.equal(route.status, 'degraded');
  const open = planRoute(graphWith(), 'SUP-DIB-01', 'R-DHE');
  assert.ok(route.primary.etaHours > open.primary.etaHours);
});

test('routing: reports on resolved incidents are ignored by callers (only active are passed)', () => {
  const g = graphWith([]);
  assert.equal(g.closed.length, 0);
});

test('supplier data quality: invalid, stale and ok', () => {
  const now = new Date();
  const base = buildSuppliers(now)[0];
  assert.equal(assessSupplier(base, now, 7).quality, 'ok');
  assert.equal(assessSupplier({ ...base, inventory: { ...base.inventory, water: -1 } }, now, 7).quality, 'invalid');
  assert.equal(assessSupplier({ ...base, inventory: { food: 1, water: 1 } }, now, 7).quality, 'invalid');
  assert.equal(assessSupplier({ ...base, location: { lat: 999, lon: 0 } }, now, 7).quality, 'invalid');
  const stale = assessSupplier({ ...base, inventoryUpdatedAt: new Date(now - 30 * 864e5) }, now, 7);
  assert.equal(stale.quality, 'stale');
  assert.equal(stale.usable, true);
});

test('duplicate emergency reports are detected inside the window only', () => {
  const now = new Date();
  const existing = [{ type: 'road_closure', edgeCode: 'E08', regionCode: 'JOR', status: 'active', reportedAt: new Date(now - 2 * 3600e3) }];
  const cand = { type: 'road_closure', edgeCode: 'E08', regionCode: 'JOR' };
  assert.ok(findDuplicate(existing, cand, now, 12));
  assert.equal(findDuplicate(existing, cand, now, 1), null); // outside a 1 h window
  assert.equal(findDuplicate(existing, { ...cand, edgeCode: 'E10' }, now, 12), null);
  assert.equal(findDuplicate([{ ...existing[0], status: 'resolved' }], cand, now, 12), null);
  assert.equal(dedupeKeyOf(cand), 'road_closure|E08|JOR');
});

test('OpenWeather normalisation: sums 3-hourly rain, treats absent rain as 0, flags short forecasts', () => {
  const list = Array.from({ length: 40 }, (_, i) => (i < 8 ? { rain: { '3h': 5 } } : {}));
  const wx = normaliseOpenWeather(region, { main: { temp: 24, humidity: 90 }, weather: [{ description: 'rain' }], rain: { '1h': 2 } }, { list });
  assert.equal(wx.rain24h, 40);
  assert.equal(wx.rain72h, 40);
  assert.equal(wx.rain1h, 2);
  assert.deepEqual(wx.missing, []);
  const short = normaliseOpenWeather(region, { main: { temp: 24, humidity: 90 } }, { list: list.slice(0, 10) });
  assert.equal(short.rain24h, 40);
  assert.equal(short.rain72h, null);
  assert.ok(short.missing.includes('rain72h'));
  const none = normaliseOpenWeather(region, null, null);
  assert.equal(none.rain24h, null);
});

test('weather provider: live without a key fails clearly; failed fetch never leaks the key', async () => {
  const noKey = createWeatherProvider({});
  await assert.rejects(() => noKey.get(region, { source: 'live' }), (e) => e.code === 'WEATHER_NOT_CONFIGURED');
  const failing = createWeatherProvider({ apiKey: 'SECRET-KEY-123', fetchImpl: async () => { throw new Error('boom https://x?appid=SECRET-KEY-123'); } });
  await assert.rejects(() => failing.get(region, { source: 'live' }), (e) => e.code === 'WEATHER_UNAVAILABLE' && !e.message.includes('SECRET-KEY-123'));
  const http401 = createWeatherProvider({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(() => http401.get(region, { source: 'live' }), (e) => e.code === 'WEATHER_UNAVAILABLE');
});

test('weather provider: live data is cached for the configured time', async () => {
  let calls = 0;
  const list = Array.from({ length: 40 }, () => ({ rain: { '3h': 1 } }));
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, json: async () => ({ main: { temp: 20, humidity: 80 }, list }) }; };
  const p = createWeatherProvider({ apiKey: 'k', fetchImpl, cacheMinutes: 10 });
  await p.get(region, { source: 'live' });
  await p.get(region, { source: 'live' });
  assert.equal(calls, 2); // current + forecast once; second get served from cache
});

test('narrative: falls back to the template when the AI call fails; never claims AI when it did not run', async () => {
  const result = {
    meta: { weatherSource: 'sample' }, risks: [{ level: 'high', name: 'Majuli', confidence: 'medium' }],
    totals: { affectedExpected: 100, affectedMin: 60, affectedMax: 140, shortage: { food: 1, water: 2, medicine: 3 }, required: {}, allocated: {}, unresolved: {} },
    allocations: [], unresolved: [], warnings: [],
  };
  assert.equal((await buildNarrative(result, {})).source, 'template');
  const failed = await buildNarrative(result, { apiKey: 'k', model: 'm', fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(failed.source, 'template');
  assert.ok(failed.note);
  const ok = await buildNarrative(result, { apiKey: 'k', model: 'm', fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'AI text' }] }) }) });
  assert.equal(ok.source, 'ai');
  assert.match(templateNarrative(result), /estimates, not guaranteed/);
});
