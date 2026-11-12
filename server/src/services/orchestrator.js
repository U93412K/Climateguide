import { AppError } from '../lib/errors.js';
import { round } from '../lib/geo.js';
import { assessRegionRisk } from './risk.js';
import { estimateAffected } from './exposure.js';
import { estimateDemand, RESOURCES, UNITS } from './demand.js';
import { buildGraph, planRoute } from './routing.js';
import { assessSupplier, allocateSupply, UNRESOLVED_TEXT } from './suppliers.js';
import { buildNarrative } from './narrative.js';

const DISCLAIMER =
  'Risk levels and population figures are model estimates, not guaranteed outcomes. ' +
  'Review by an authorised human is required before any dispatch.';

/**
 * Multi-agent style pipeline. Each "agent" is a stage with a single responsibility that consumes
 * the previous stages' structured output; the coordinator merges everything into one plan.
 * All figures are computed deterministically; the optional LLM only writes the narrative text.
 *
 * data: { regions, suppliers, nodes, edges, reports, assumptions }
 * opts: { regionCodes, weatherSource, scenario, now }
 * deps: { weather: { get(region, {source, scenario, now}) }, narrative?: {apiKey, model, fetchImpl} }
 */
export async function runPipeline(data, opts, deps) {
  const now = opts.now ?? new Date();
  const { assumptions } = data;
  const stages = [];
  const warnings = [];
  const warn = (level, code, message, regionCode) => warnings.push({ level, code, message, ...(regionCode && { regionCode }) });

  async function stage(agent, fn) {
    const t0 = Date.now();
    try {
      const { value, summary } = await fn();
      stages.push({ agent, status: 'completed', durationMs: Date.now() - t0, summary });
      return value;
    } catch (err) {
      stages.push({ agent, status: 'failed', durationMs: Date.now() - t0, summary: err.message });
      throw err;
    }
  }

  const allRegions = data.regions;
  const selected = opts.regionCodes?.length ? opts.regionCodes : allRegions.map((r) => r.code);
  const unknown = selected.filter((c) => !allRegions.some((r) => r.code === c));
  if (unknown.length) {
    throw new AppError(422, 'UNKNOWN_LOCATION', `Unknown region(s): ${unknown.join(', ')}. Please select a valid location.`, { valid: allRegions.map((r) => r.code) });
  }
  const regions = allRegions.filter((r) => selected.includes(r.code));
  const activeReports = data.reports.filter((r) => r.status === 'active');

  // 1) RiskAgent: weather -> flood / extreme-rainfall risk per region
  const risks = await stage('RiskAgent', async () => {
    const out = await Promise.all(
      regions.map(async (region) => {
        const wx = await deps.weather.get(region, { source: opts.weatherSource, scenario: opts.scenario, now });
        return assessRegionRisk(region, wx, activeReports, assumptions);
      }),
    );
    const c = (l) => out.filter((r) => r.level === l).length;
    return { value: out, summary: `${c('high')} high, ${c('medium')} medium, ${c('low')} low, ${c('unavailable')} unavailable` };
  });

  if (opts.weatherSource === 'sample') warn('info', 'SAMPLE_DATA', 'Using SAMPLE weather and demo datasets. Not a real forecast.');
  for (const r of risks) {
    if (r.level === 'unavailable') warn('warning', 'RISK_UNAVAILABLE', `${r.name}: weather data incomplete, risk level unavailable. Do not treat as safe.`, r.regionCode);
    else if (r.incomplete) warn('warning', 'RISK_INCOMPLETE', `${r.name}: 72 h forecast missing, risk estimate is incomplete (low confidence).`, r.regionCode);
  }

  // 2) ExposureAgent: affected settlements and population (medium/high risk only)
  const affectedRisks = risks.filter((r) => r.level === 'medium' || r.level === 'high');
  const exposure = await stage('ExposureAgent', async () => {
    const out = affectedRisks.map((r) => estimateAffected(regions.find((x) => x.code === r.regionCode), r.level, assumptions));
    return { value: out, summary: `${out.length} affected region(s), ${out.reduce((a, e) => a + (e.totals?.expected || 0), 0)} people expected to need assistance` };
  });
  for (const e of exposure) {
    const name = regions.find((r) => r.code === e.regionCode).name;
    if (!e.available) warn('critical', 'NO_POPULATION_DATA', `${name}: no population data. Affected-population and resource estimates are unavailable: manual assessment needed.`, e.regionCode);
    else if (e.partial) warn('warning', 'PARTIAL_POPULATION_DATA', `${name}: no population data for ${e.unknownSettlements.join(', ')}. Figures are a lower bound.`, e.regionCode);
  }

  // 3) DemandAgent: food / water / medicine demand vs local stock
  const demand = await stage('DemandAgent', async () => {
    const out = exposure.map((e) => estimateDemand(e, regions.find((r) => r.code === e.regionCode), assumptions));
    return { value: out, summary: `demand computed for ${out.filter((d) => d.available).length} region(s)` };
  });

  // Delivery priority: risk score (50%) + share of the largest affected population (50%).
  const riskBy = Object.fromEntries(risks.map((r) => [r.regionCode, r]));
  const maxAffected = Math.max(1, ...demand.filter((d) => d.available).map((d) => d.affectedExpected));
  const priorities = demand
    .filter((d) => d.available)
    .map((d) => ({ regionCode: d.regionCode, name: riskBy[d.regionCode].name, riskLevel: riskBy[d.regionCode].level, score: round(0.5 * riskBy[d.regionCode].score + 0.5 * (d.affectedExpected / maxAffected), 3) }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  // 4) RoutingAgent: road graph with active disruptions
  const graph = await stage('RoutingAgent', async () => {
    const g = buildGraph(data.nodes, data.edges, activeReports);
    return { value: g, summary: `${g.closed.length} closed and ${g.degraded.length} degraded road segment(s) applied` };
  });
  for (const e of graph.closed) warn('info', 'ROAD_CLOSED', `Road closed: ${e.name} (${e.disruptionReasons.join('; ')}).`);
  const unmapped = activeReports.filter((r) => ['road_closure', 'landslide', 'bridge_damage'].includes(r.type) && !r.edgeCode);
  if (unmapped.length) warn('info', 'UNMAPPED_DISRUPTION', `${unmapped.length} reported road disruption(s) are not linked to a road segment and could not be applied to routing.`);
  warn('info', 'ROAD_DATA_LIMIT', 'Road disruptions reflect only reported incidents and administrator updates; real-time conditions may differ.');

  // 5) SupplierAgent: data-quality gate, matching, allocation (uses routing)
  const supplierAssessments = data.suppliers.map((s) => ({ supplier: s, ...assessSupplier(s, now, assumptions.staleSupplierDays) }));
  const supplierFlags = supplierAssessments.filter((a) => a.quality !== 'ok').map((a) => ({ supplierCode: a.supplier.code, supplierName: a.supplier.name, quality: a.quality, usable: a.usable, flags: a.flags }));
  for (const f of supplierFlags) {
    warn(f.usable ? 'warning' : 'critical', f.usable ? 'SUPPLIER_STALE' : 'SUPPLIER_INVALID',
      `${f.supplierName}: ${f.flags.join('; ')}${f.usable ? '' : '. Excluded from matching.'}`);
  }
  const usable = supplierAssessments.filter((a) => a.usable).map((a) => ({ ...a.supplier, quality: a.quality, flags: a.flags }));

  const routeCache = new Map();
  const routeFor = (supplierCode, regionCode) => {
    const k = `${supplierCode}>${regionCode}`;
    if (!routeCache.has(k)) routeCache.set(k, planRoute(graph, supplierCode, `R-${regionCode}`));
    return routeCache.get(k);
  };

  const supply = await stage('SupplierAgent', async () => {
    const needs = priorities
      .map((p) => {
        const d = demand.find((x) => x.regionCode === p.regionCode);
        return { regionCode: p.regionCode, shortage: d.shortage, center: regions.find((r) => r.code === p.regionCode).center };
      })
      .filter((n) => RESOURCES.some((r) => n.shortage[r] > 0));
    const out = allocateSupply({ needs, suppliers: usable, routeFor, maxRadiusKm: assumptions.maxSupplierRadiusKm });
    return { value: out, summary: `${out.allocations.length} allocation(s), ${out.unresolved.length} unresolved shortage line(s)` };
  });

  // Destination accessibility + routing warnings
  const inaccessible = [];
  for (const p of priorities) {
    const d = demand.find((x) => x.regionCode === p.regionCode);
    const needsSupply = RESOURCES.some((r) => d.shortage[r] > 0);
    if (!needsSupply) continue;
    const anyRoute = usable.some((s) => routeFor(s.code, p.regionCode).status !== 'inaccessible');
    if (!anyRoute) {
      inaccessible.push(p.regionCode);
      warn('critical', 'DESTINATION_INACCESSIBLE', `${p.name}: no accessible delivery route from any supplier. Marked inaccessible: manual intervention required.`, p.regionCode);
    }
  }
  for (const a of supply.allocations) {
    const regionName = riskBy[a.regionCode].name;
    if (a.route.status === 'rerouted') warn('warning', 'ROUTE_REROUTED', `${a.supplierName} -> ${regionName}: preferred route blocked (${a.route.avoided.map((s) => s.name).join(', ')}); using an alternative route.`, a.regionCode);
    if (a.route.status === 'degraded') warn('info', 'ROUTE_DEGRADED', `${a.supplierName} -> ${regionName}: route uses flooded/damaged segments; expect delays.`, a.regionCode);
    if (a.quality === 'stale') warn('warning', 'ALLOCATION_STALE_SUPPLIER', `${a.supplierName} allocation relies on stale inventory data; verify stock before dispatch.`, a.regionCode);
  }
  for (const u of supply.unresolved) {
    const name = riskBy[u.regionCode].name;
    warn(u.reason === 'NO_ACCESSIBLE_ROUTE' ? 'critical' : 'warning', 'UNRESOLVED_SHORTAGE',
      `${name}: ${Math.round(u.amount).toLocaleString('en-IN')} ${UNITS[u.resource]} of ${u.resource} unresolved: ${UNRESOLVED_TEXT[u.reason]}.`, u.regionCode);
  }
  if (!affectedRisks.length && risks.some((r) => r.level !== 'unavailable')) warn('info', 'NO_REGIONS_AT_RISK', 'No selected region is at medium or high estimated risk; no relief actions are proposed.');

  // 6) CoordinatorAgent: merge into a consolidated plan
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const avail = demand.filter((d) => d.available);
  const totals = {
    affectedExpected: sum(exposure, (e) => e.totals?.expected || 0),
    affectedMin: sum(exposure, (e) => e.totals?.min || 0),
    affectedMax: sum(exposure, (e) => e.totals?.max || 0),
    required: Object.fromEntries(RESOURCES.map((r) => [r, sum(avail, (d) => d.required[r])])),
    local: Object.fromEntries(RESOURCES.map((r) => [r, sum(avail, (d) => d.local[r] || 0)])),
    shortage: Object.fromEntries(RESOURCES.map((r) => [r, sum(avail, (d) => d.shortage[r])])),
    allocated: Object.fromEntries(RESOURCES.map((r) => [r, sum(supply.allocations, (a) => a.items[r])])),
    unresolved: Object.fromEntries(RESOURCES.map((r) => [r, sum(supply.unresolved.filter((u) => u.resource === r), (u) => u.amount)])),
  };

  const result = await stage('CoordinatorAgent', async () => {
    const withActions = supply.allocations.map((a) => {
      const prio = priorities.find((p) => p.regionCode === a.regionCode)?.rank ?? 99;
      const d = demand.find((x) => x.regionCode === a.regionCode);
      const served = exposure.find((e) => e.regionCode === a.regionCode).settlements.filter((s) => s.populationKnown).map((s) => s.name);
      return { ...a, priorityRank: prio, destinationName: riskBy[a.regionCode].name, settlementsServed: served, regionShortage: d.shortage };
    }).sort((a, b) => a.priorityRank - b.priorityRank || a.route.primary.etaHours - b.route.primary.etaHours);
    withActions.forEach((a, i) => { a.id = `A${String(i + 1).padStart(2, '0')}`; });

    const r = {
      meta: { generatedAt: now.toISOString(), weatherSource: opts.weatherSource, scenario: opts.weatherSource === 'sample' ? opts.scenario : null, regionCodes: regions.map((x) => x.code), disclaimer: DISCLAIMER },
      assumptions, risks, affected: exposure, demand, priorities, totals,
      allocations: withActions, unresolved: supply.unresolved, inaccessibleRegions: inaccessible,
      candidates: supply.candidatesByRegion, supplierFlags, stockAfter: supply.stockAfter,
      roadDisruptions: [...graph.closed, ...graph.degraded].map((e) => ({ code: e.code, name: e.name, status: e.effectiveStatus, reasons: e.disruptionReasons })),
      warnings, stages: [],
    };
    return { value: r, summary: `plan assembled: ${withActions.length} delivery(ies), ${warnings.length} warning(s)` };
  });

  result.narrative = await buildNarrative(result, deps.narrative || {});
  result.stages = stages;
  return result;
}
