import { round } from '../lib/geo.js';

/**
 * Road-network routing.
 *  - Graph = nodes (relief points + suppliers) and undirected edges (road/ferry segments).
 *  - Disruptions come from edge.status (admin-set) and ACTIVE emergency reports.
 *  - Cost = travel hours + 0.002 * km  (minimises time first, distance as tie-breaker).
 *  - Closed segments are impassable; degraded segments run at half speed.
 * Dijkstra is O(V^2); fine for district-scale graphs. Swap in a heap/OSRM for city-scale networks.
 */

const CLOSING_TYPES = new Set(['road_closure', 'landslide', 'bridge_damage']);
const DEGRADING_TYPES = new Set(['flooding', 'other']);
const RANK = { open: 0, degraded: 1, closed: 2 };

/** Apply admin status + active emergency reports to edges. */
export function applyDisruptions(edges, activeReports) {
  return edges.map((e) => {
    let status = e.status || 'open';
    const reasons = [];
    if (status !== 'open') reasons.push(`Marked ${status} by an administrator`);
    for (const r of activeReports) {
      if (r.edgeCode !== e.code) continue;
      const next = CLOSING_TYPES.has(r.type) ? 'closed' : DEGRADING_TYPES.has(r.type) ? 'degraded' : null;
      if (!next) continue;
      reasons.push(`Report: ${r.type.replace('_', ' ')} (severity ${r.severity})`);
      if (RANK[next] > RANK[status]) status = next;
    }
    return { ...e, effectiveStatus: status, disruptionReasons: reasons };
  });
}

export function buildGraph(nodes, edges, activeReports = []) {
  const effEdges = applyDisruptions(edges, activeReports);
  return {
    nodes: new Map(nodes.map((n) => [n.code, n])),
    edges: effEdges,
    closed: effEdges.filter((e) => e.effectiveStatus === 'closed'),
    degraded: effEdges.filter((e) => e.effectiveStatus === 'degraded'),
  };
}

const edgeHours = (e, ignoreDisruptions) => {
  const speed = e.speedKmh * (!ignoreDisruptions && e.effectiveStatus === 'degraded' ? 0.5 : 1);
  return e.distanceKm / speed;
};
const edgeCost = (e, ignore) => edgeHours(e, ignore) + 0.002 * e.distanceKm;

function shortest(graph, from, to, { ignoreDisruptions = false, banned = new Set() } = {}) {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  const adj = new Map();
  for (const e of graph.edges) {
    if (banned.has(e.code)) continue;
    if (!ignoreDisruptions && e.effectiveStatus === 'closed') continue;
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push({ to: b, edge: e });
    }
  }
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let u = null;
    for (const [k, d] of dist) if (!done.has(k) && (u === null || d < dist.get(u))) u = k;
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const { to: v, edge } of adj.get(u) || []) {
      const nd = dist.get(u) + edgeCost(edge, ignoreDisruptions);
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, { node: u, edge });
      }
    }
  }
  const nodeCodes = [to];
  const segments = [];
  for (let cur = to; cur !== from; ) {
    const p = prev.get(cur);
    segments.unshift(p.edge);
    nodeCodes.unshift(p.node);
    cur = p.node;
  }
  const distanceKm = segments.reduce((a, e) => a + e.distanceKm, 0);
  const etaHours = segments.reduce((a, e) => a + edgeHours(e, ignoreDisruptions), 0);
  return {
    nodes: nodeCodes,
    edges: segments.map((e) => e.code),
    distanceKm: round(distanceKm, 1),
    etaHours: round(etaHours, 2),
    coords: nodeCodes.map((c) => [graph.nodes.get(c).lat, graph.nodes.get(c).lon]),
    segments: segments.map((e) => ({ code: e.code, name: e.name, kind: e.kind, status: e.effectiveStatus, distanceKm: e.distanceKm, reasons: e.disruptionReasons })),
    cost: dist.get(to),
  };
}

const strip = ({ cost, ...r }) => r;

/**
 * Plan a delivery route. status:
 *   ok           preferred route is fully open
 *   degraded     route works but uses slowed (flooded/damaged) segments
 *   rerouted     preferred route is blocked; an alternative open route was found
 *   inaccessible no open route: manual intervention required
 */
export function planRoute(graph, from, to) {
  if (from === to) return { status: 'ok', from, to, primary: { nodes: [from], edges: [], distanceKm: 0, etaHours: 0, coords: [], segments: [] }, baseline: null, avoided: [], alternative: null };
  const baseline = shortest(graph, from, to, { ignoreDisruptions: true });
  if (!baseline) return { status: 'inaccessible', from, to, reason: 'NO_ROAD_CONNECTION', message: 'These locations are not connected in the road network data.', primary: null, baseline: null, avoided: [], alternative: null };

  const actual = shortest(graph, from, to);
  if (!actual) {
    return {
      status: 'inaccessible', from, to, reason: 'ALL_ROUTES_BLOCKED',
      message: 'Every route is blocked by reported closures. Manual intervention is required.',
      primary: null, baseline: strip(baseline),
      avoided: baseline.segments.filter((s) => s.status === 'closed'), alternative: null,
    };
  }

  const rerouted = actual.edges.join() !== baseline.edges.join();
  let alternative = null;
  for (const code of actual.edges) {
    const alt = shortest(graph, from, to, { banned: new Set([code]) });
    if (alt && alt.edges.join() !== actual.edges.join() && (!alternative || alt.cost < alternative.cost)) alternative = alt;
  }
  const hasDegraded = actual.segments.some((s) => s.status === 'degraded');
  return {
    status: rerouted ? 'rerouted' : hasDegraded ? 'degraded' : 'ok',
    from, to,
    primary: strip(actual),
    baseline: rerouted ? strip(baseline) : null,
    avoided: rerouted ? baseline.segments.filter((s) => s.status === 'closed') : [],
    alternative: alternative ? strip(alternative) : null,
  };
}
