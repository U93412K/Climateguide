/**
 * Demo dataset for ClimateGuide.
 *
 * IMPORTANT: everything here is ILLUSTRATIVE SAMPLE DATA for demonstration.
 *  - Place names/coordinates are approximate, populations and stock levels are invented.
 *  - The road network is a simplified sample graph (distances derived from coordinates), not a
 *    survey of real roads. Replace with OpenStreetMap-derived data for real operations.
 */
import bcrypt from 'bcryptjs';
import { INDIA_REGIONS, INDIA_SUPPLIERS, INDIA_EDGE_DEFS } from './india.js';
import { haversineKm, ROAD_CIRCUITY, FERRY_CIRCUITY, round } from '../lib/geo.js';

export const DEFAULT_ASSUMPTIONS = {
  foodKgPerPersonPerDay: 0.5,
  waterLPerPersonPerDay: 5, // drinking + basic cooking only (configurable)
  medicineKitsPerPerson: 0.02, // 1 basic kit per 50 people
  planningDays: 3, // set to 1 to use the per-person formulas literally
  impactRate: { medium: 0.08, high: 0.3 }, // share of flood-exposed people likely to need help
  uncertainty: 0.4, // +/- band around the expected affected population
  riskThresholds: { medium: 0.3, high: 0.55 },
  maxSupplierRadiusKm: 500,
  staleSupplierDays: 7,
  dedupeWindowHours: 12,
};

const s = (name, lat, lon, population, floodProneShare, extra = {}) => ({
  name, lat, lon, population, floodProneShare, ...extra,
});

const ASSAM_REGIONS = [
  {
    code: 'DHE', name: 'Dhemaji', state: 'Assam',
    center: { lat: 27.48, lon: 94.58 },
    elevationM: 105, riverDistanceKm: 5, floodHistory: 0.9, drainage: 0.3,
    localInventory: { food: 6000, water: 40000, medicine: 120 },
    settlements: [
      s('Dhemaji Town', 27.47, 94.57, 28000, 0.5),
      s('Silapathar', 27.59, 94.72, 22000, 0.6),
      s('Gogamukh', 27.37, 94.58, 15000, 0.85),
    ],
  },
  {
    code: 'MAJ', name: 'Majuli', state: 'Assam',
    center: { lat: 26.95, lon: 94.17 },
    elevationM: 85, riverDistanceKm: 1, floodHistory: 0.95, drainage: 0.2,
    localInventory: { food: 2000, water: 15000, medicine: 40 },
    settlements: [
      s('Garamur', 26.96, 94.2, 9000, 0.8),
      s('Kamalabari', 26.9, 94.22, 12000, 0.85),
      s('Jengraimukh', 27.1, 94.28, 7000, 0.9),
    ],
  },
  {
    code: 'JOR', name: 'Jorhat', state: 'Assam',
    center: { lat: 26.75, lon: 94.22 },
    elevationM: 95, riverDistanceKm: 15, floodHistory: 0.5, drainage: 0.55,
    localInventory: { food: 15000, water: 90000, medicine: 300 },
    settlements: [
      s('Jorhat Town', 26.75, 94.21, 126000, 0.1),
      s('Titabor', 26.6, 94.19, 20000, 0.3),
      s('Mariani', 26.66, 94.31, 18000, 0.35),
    ],
  },
  {
    code: 'MOR', name: 'Morigaon', state: 'Assam',
    center: { lat: 26.25, lon: 92.34 },
    elevationM: 55, riverDistanceKm: 4, floodHistory: 0.85, drainage: 0.3,
    localInventory: { food: 4000, water: 30000, medicine: 80 },
    settlements: [
      s('Morigaon Town', 26.25, 92.34, 25000, 0.6),
      s('Mayong', 26.24, 92.04, 11000, 0.8),
      s('Jagiroad', 26.15, 92.17, 17000, 0.5),
      // Deliberately missing population: demonstrates the "no population data" uncertainty warning.
      s('Bhuragaon', 26.38, 92.27, null, 0.7),
    ],
  },
  {
    code: 'GHY', name: 'Guwahati (Kamrup Metro)', state: 'Assam',
    center: { lat: 26.14, lon: 91.74 },
    elevationM: 55, riverDistanceKm: 3, floodHistory: 0.55, drainage: 0.5,
    localInventory: { food: 30000, water: 200000, medicine: 800 },
    settlements: [
      s('Guwahati Central', 26.18, 91.75, 250000, 0.12),
      s('Dispur-Beltola', 26.14, 91.8, 120000, 0.15),
      s('Jalukbari', 26.16, 91.67, 60000, 0.2),
    ],
  },
  {
    code: 'BAR', name: 'Barpeta', state: 'Assam',
    center: { lat: 26.32, lon: 91.0 },
    elevationM: 40, riverDistanceKm: 6, floodHistory: 0.8, drainage: 0.35,
    localInventory: { food: 3500, water: 25000, medicine: 70 },
    settlements: [
      s('Barpeta Town', 26.32, 91.0, 45000, 0.5),
      s('Sarthebari', 26.2, 91.15, 18000, 0.6),
      s('Pathsala', 26.5, 91.18, 20000, 0.55),
    ],
  },
];

export const REGIONS = [...ASSAM_REGIONS, ...INDIA_REGIONS];

const DAY = 24 * 3600 * 1000;

/** Supplier inventory: food in kg, water in litres, medicine in basic kits. */
export const buildSuppliers = (now = new Date()) => {
  const fresh = new Date(now.getTime() - 3 * 3600 * 1000);
  return [
    { code: 'SUP-GHY-01', name: 'Guwahati Central Relief Depot', type: 'Government depot', location: { lat: 26.2, lon: 91.73 }, contact: '+91-00000-00001', inventory: { food: 60000, water: 400000, medicine: 900 }, inventoryUpdatedAt: fresh },
    { code: 'SUP-JOR-01', name: 'Jorhat District Food Warehouse', type: 'Government depot', location: { lat: 26.77, lon: 94.19 }, contact: '+91-00000-00002', inventory: { food: 40000, water: 60000, medicine: 150 }, inventoryUpdatedAt: fresh },
    { code: 'SUP-NAG-01', name: 'Nagaon Wholesale Grain & Water', type: 'Commercial supplier', location: { lat: 26.36, lon: 92.69 }, contact: '+91-00000-00003', inventory: { food: 35000, water: 150000, medicine: 100 }, inventoryUpdatedAt: fresh },
    { code: 'SUP-TEZ-01', name: 'Tezpur Medical & Relief Stores', type: 'Commercial supplier', location: { lat: 26.64, lon: 92.8 }, contact: '+91-00000-00004', inventory: { food: 8000, water: 30000, medicine: 500 }, inventoryUpdatedAt: fresh },
    { code: 'SUP-DIB-01', name: 'Dibrugarh NGO Logistics Hub', type: 'NGO', location: { lat: 27.47, lon: 94.91 }, contact: '+91-00000-00005', inventory: { food: 25000, water: 120000, medicine: 250 }, inventoryUpdatedAt: fresh },
    { code: 'SUP-BNG-01', name: 'Bongaigaon Water Works Store', type: 'Government depot', location: { lat: 26.48, lon: 90.56 }, contact: '+91-00000-00006', inventory: { food: 5000, water: 250000, medicine: 60 }, inventoryUpdatedAt: fresh },
    // Stale record (inventory last updated 20 days ago): usable but flagged "verify before dispatch".
    { code: 'SUP-MAN-01', name: 'Mangaldai Community Stock', type: 'NGO', location: { lat: 26.44, lon: 92.03 }, contact: '+91-00000-00007', inventory: { food: 12000, water: 20000, medicine: 100 }, inventoryUpdatedAt: new Date(now.getTime() - 20 * DAY) },
    // Inconsistent record (negative water): excluded and flagged.
    { code: 'SUP-KOK-01', name: 'Kokrajhar Relief Store', type: 'Government depot', location: { lat: 26.4, lon: 90.27 }, contact: '+91-00000-00008', inventory: { food: 9000, water: -500, medicine: 40 }, inventoryUpdatedAt: fresh },
    ...INDIA_SUPPLIERS.map((x) => ({ ...x, inventoryUpdatedAt: fresh })),
  ];
};

const R = (c) => `R-${c}`;
export const NODES_FROM = (regions, suppliers) => [
  ...regions.map((r) => ({ code: R(r.code), name: `${r.name} relief point`, kind: 'region', lat: r.center.lat, lon: r.center.lon })),
  ...suppliers.map((p) => ({ code: p.code, name: p.name, kind: 'supplier', lat: p.location.lat, lon: p.location.lon })),
];

// [code, from, to, name, kind, speedKmh]
const EDGE_DEFS = [
  ['E01', 'SUP-GHY-01', R('GHY'), 'Guwahati city roads', 'road', 30],
  ['E02', 'SUP-GHY-01', 'SUP-MAN-01', 'Guwahati-Mangaldai road', 'road', 50],
  ['E03', 'SUP-MAN-01', 'SUP-TEZ-01', 'Mangaldai-Tezpur road', 'road', 50],
  ['E04', R('GHY'), R('MOR'), 'Guwahati-Morigaon road', 'road', 55],
  ['E05', R('MOR'), 'SUP-NAG-01', 'Morigaon-Nagaon road', 'road', 50],
  ['E06', 'SUP-GHY-01', 'SUP-NAG-01', 'Guwahati-Nagaon highway', 'road', 60],
  ['E07', 'SUP-NAG-01', 'SUP-TEZ-01', 'Nagaon-Tezpur bridge road', 'road', 45],
  ['E08', 'SUP-NAG-01', 'SUP-JOR-01', 'Nagaon-Jorhat highway', 'road', 60],
  ['E09', 'SUP-TEZ-01', 'SUP-JOR-01', 'Tezpur-Jorhat ferry link', 'ferry', 15],
  ['E10', 'SUP-JOR-01', R('JOR'), 'Jorhat local roads', 'road', 35],
  ['E11', R('JOR'), R('MAJ'), 'Jorhat-Majuli ferry', 'ferry', 12],
  ['E12', 'SUP-JOR-01', 'SUP-DIB-01', 'Jorhat-Dibrugarh highway', 'road', 60],
  ['E13', 'SUP-DIB-01', R('DHE'), 'Dibrugarh-Dhemaji bridge road', 'road', 50],
  ['E14', R('DHE'), R('MAJ'), 'Dhemaji-Majuli ferry link', 'ferry', 12],
  ['E15', R('GHY'), R('BAR'), 'Guwahati-Barpeta road', 'road', 55],
  ['E16', R('BAR'), 'SUP-BNG-01', 'Barpeta-Bongaigaon road', 'road', 55],
  ['E17', 'SUP-GHY-01', 'SUP-BNG-01', 'Guwahati-Bongaigaon highway', 'road', 60],
  ['E18', 'SUP-BNG-01', 'SUP-KOK-01', 'Bongaigaon-Kokrajhar road', 'road', 55],
];

export const buildEdges = (nodes) => {
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  return [...EDGE_DEFS, ...INDIA_EDGE_DEFS].map(([code, from, to, name, kind, speedKmh]) => {
    const a = byCode.get(from);
    const b = byCode.get(to);
    const factor = kind === 'ferry' ? FERRY_CIRCUITY : ROAD_CIRCUITY;
    return { code, from, to, name, kind, speedKmh, status: 'open', distanceKm: round(haversineKm(a, b) * factor, 1) };
  });
};

export const buildReports = (now = new Date()) => {
  const ago = (h) => new Date(now.getTime() - h * 3600 * 1000);
  return [
    { type: 'road_closure', regionCode: 'JOR', edgeCode: 'E08', severity: 4, description: 'Highway section under water near river crossing; closed to traffic.', status: 'active', duplicateCount: 0, reportedAt: ago(3), source: 'seed' },
    { type: 'flooding', regionCode: 'MAJ', edgeCode: null, severity: 4, description: 'River overtopping at low-lying villages.', status: 'active', duplicateCount: 0, reportedAt: ago(5), source: 'seed' },
    { type: 'road_closure', regionCode: 'DBG', edgeCode: 'E20', severity: 4, description: 'Bagmati overflow on the road near Muzaffarpur; closed to traffic.', status: 'active', duplicateCount: 0, reportedAt: ago(4), source: 'seed' },
    { type: 'flooding', regionCode: 'SPL', edgeCode: null, severity: 4, description: 'Kosi embankment seepage; low-lying villages inundated.', status: 'active', duplicateCount: 0, reportedAt: ago(6), source: 'seed' },
    { type: 'flooding', regionCode: 'MOR', edgeCode: 'E05', severity: 3, description: 'Waterlogging on the road; vehicles moving slowly.', status: 'active', duplicateCount: 0, reportedAt: ago(2), source: 'seed' },
  ].map((r) => ({ ...r, dedupeKey: dedupeKeyOf(r) }));
};

export function dedupeKeyOf(r) {
  return `${r.type}|${r.edgeCode || '-'}|${r.regionCode || '-'}`;
}

export const DEMO_USERS = [
  { name: 'Asha Verma', email: 'admin@climateguide.example', role: 'admin' },
  { name: 'Ravi Sharma', email: 'coordinator@climateguide.example', role: 'coordinator' },
  { name: 'Meera Das', email: 'logistics@climateguide.example', role: 'logistics' },
  { name: 'Vikram Rao', email: 'viewer@climateguide.example', role: 'viewer' },
];

/** Seeds only if the store has no regions yet. */
export async function seedStore(store, { password, now = new Date(), force = false } = {}) {
  if (!force && (await store.regions.count()) > 0) return { seeded: false };
  if (!password) throw new Error('A seed password is required (set SEED_PASSWORD).');

  const suppliers = buildSuppliers(now);
  const nodes = NODES_FROM(REGIONS, suppliers);
  const edges = buildEdges(nodes);

  await store.regions.insertMany(REGIONS);
  await store.suppliers.insertMany(suppliers);
  await store.nodes.insertMany(nodes);
  await store.edges.insertMany(edges);
  await store.reports.insertMany(buildReports(now));
  await store.settings.insert({ key: 'assumptions', value: DEFAULT_ASSUMPTIONS });

  if ((await store.users.count()) === 0) {
    const passwordHash = await bcrypt.hash(password, 10);
    await store.users.insertMany(DEMO_USERS.map((u) => ({ ...u, passwordHash })));
  }
  return { seeded: true };
}
