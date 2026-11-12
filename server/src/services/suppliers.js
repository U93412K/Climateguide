import { haversineKm, isFiniteNumber, isValidPoint } from '../lib/geo.js';
import { RESOURCES } from './demand.js';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Data-quality gate for supplier records.
 *  invalid -> excluded (missing/negative/non-numeric stock, bad coordinates)
 *  stale   -> usable but flagged "verify before dispatch"
 */
export function assessSupplier(supplier, now, staleDays) {
  const flags = [];
  if (!isValidPoint(supplier.location)) flags.push('Missing or invalid coordinates');
  for (const r of RESOURCES) {
    const v = supplier.inventory?.[r];
    if (v === undefined || v === null) flags.push(`Missing ${r} inventory figure`);
    else if (!isFiniteNumber(v)) flags.push(`Non-numeric ${r} inventory`);
    else if (v < 0) flags.push(`Negative ${r} inventory (${v})`);
  }
  if (flags.length) return { quality: 'invalid', usable: false, flags };

  const updated = supplier.inventoryUpdatedAt ? new Date(supplier.inventoryUpdatedAt) : null;
  if (!updated || Number.isNaN(updated.getTime())) return { quality: 'stale', usable: true, flags: ['Inventory has no last-updated date: verify before dispatch'] };
  const ageDays = (now - updated) / DAY_MS;
  if (ageDays > staleDays) return { quality: 'stale', usable: true, flags: [`Inventory last updated ${Math.floor(ageDays)} days ago: verify before dispatch`] };
  return { quality: 'ok', usable: true, flags: [] };
}

const sortByEta = (a, b) =>
  a.route.primary.etaHours - b.route.primary.etaHours || a.route.primary.distanceKm - b.route.primary.distanceKm;

/**
 * Greedy, priority-ordered allocation. Regions are served in priority order; each resource is
 * filled from the fastest-reachable supplier first, splitting across suppliers when stock runs out.
 * Supplier stock is shared across regions (never double-allocated).
 *
 * needs: [{ regionCode, shortage:{food,water,medicine}, center }] in priority order
 * suppliers: usable suppliers [{code,name,location,inventory,quality,flags}]
 * routeFor(supplierCode, regionCode) -> planRoute result
 */
export function allocateSupply({ needs, suppliers, routeFor, maxRadiusKm }) {
  const remaining = new Map(suppliers.map((s) => [s.code, { ...s.inventory }]));
  const bySupplierRegion = new Map();
  const unresolved = [];
  const candidatesByRegion = {};

  for (const n of needs) {
    const inRange = suppliers.filter((s) => haversineKm(s.location, n.center) <= maxRadiusKm);
    // Candidate listing for the logistics report (uses initial stock, shows alternatives).
    const initial = inRange
      .map((s) => ({ s, route: routeFor(s.code, n.regionCode) }))
      .filter((c) => c.route.status !== 'inaccessible')
      .sort(sortByEta);
    candidatesByRegion[n.regionCode] = initial.slice(0, 4).map((c) => ({
      supplierCode: c.s.code, supplierName: c.s.name, etaHours: c.route.primary.etaHours,
      distanceKm: c.route.primary.distanceKm, routeStatus: c.route.status, quality: c.s.quality,
      inventory: { ...c.s.inventory },
    }));

    for (const res of RESOURCES) {
      let left = n.shortage[res] || 0;
      if (left <= 0) continue;
      const withStock = inRange.filter((s) => remaining.get(s.code)[res] > 0);
      const reachable = withStock
        .map((s) => ({ s, route: routeFor(s.code, n.regionCode) }))
        .filter((c) => c.route.status !== 'inaccessible')
        .sort(sortByEta);

      for (const c of reachable) {
        if (left <= 0) break;
        const take = Math.min(left, remaining.get(c.s.code)[res]);
        if (take <= 0) continue;
        remaining.get(c.s.code)[res] -= take;
        left -= take;
        const key = `${c.s.code}|${n.regionCode}`;
        if (!bySupplierRegion.has(key)) {
          bySupplierRegion.set(key, {
            supplierCode: c.s.code, supplierName: c.s.name, regionCode: n.regionCode,
            items: { food: 0, water: 0, medicine: 0 }, route: c.route, quality: c.s.quality, flags: c.s.flags,
          });
        }
        bySupplierRegion.get(key).items[res] += take;
      }

      if (left > 0) {
        // NO_ACCESSIBLE_ROUTE only when NO supplier in range has an open road to the destination
        // (stock elsewhere that cannot be reached must not hide the real cause: depleted local depots).
        const reason = initial.length === 0 && withStock.length > 0
          ? 'NO_ACCESSIBLE_ROUTE'
          : reachable.length === 0
            ? 'NO_REMAINING_SUPPLIER_STOCK'
            : 'INSUFFICIENT_SUPPLIER_STOCK';
        unresolved.push({ regionCode: n.regionCode, resource: res, amount: left, reason });
      }
    }
  }

  const allocations = [...bySupplierRegion.values()].map((a, i) => ({ id: `A${String(i + 1).padStart(2, '0')}`, ...a }));
  const stockAfter = Object.fromEntries([...remaining].map(([k, v]) => [k, v]));
  return { allocations, unresolved, candidatesByRegion, stockAfter };
}

export const UNRESOLVED_TEXT = {
  NO_REMAINING_SUPPLIER_STOCK: 'no supplier stock remains within range (after higher-priority deliveries)',
  INSUFFICIENT_SUPPLIER_STOCK: 'available supplier stock is not enough to cover it',
  NO_ACCESSIBLE_ROUTE: 'suppliers have stock but no open road route reaches the destination',
};
