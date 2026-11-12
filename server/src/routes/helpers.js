import { z } from 'zod';
import { getAssumptions } from '../store/index.js';
import { DEFAULT_ASSUMPTIONS } from '../data/seed.js';
import { REPORT_TYPES } from '../services/reports.js';
import { SCENARIOS, DEFAULT_SCENARIO } from '../services/weather.js';

/** Load everything the pipeline needs in one go. */
export async function loadData(store) {
  const [regions, suppliers, nodes, edges, reports, assumptions] = await Promise.all([
    store.regions.find(),
    store.suppliers.find(),
    store.nodes.find(),
    store.edges.find(),
    store.reports.find(),
    getAssumptions(store, DEFAULT_ASSUMPTIONS),
  ]);
  return { regions, suppliers, nodes, edges, reports, assumptions };
}

export const sourceSchema = z.enum(['sample', 'live']).default('sample');
export const scenarioSchema = z.enum(Object.keys(SCENARIOS)).default(DEFAULT_SCENARIO);

export const reportInputSchema = z.object({
  type: z.enum(REPORT_TYPES),
  regionCode: z.string().trim().min(2).max(10).toUpperCase(),
  edgeCode: z.string().trim().max(30).optional().nullable(),
  severity: z.coerce.number().int().min(1).max(5).default(3),
  description: z.string().trim().max(280).optional().default(''),
}).refine((r) => r.type !== 'road_closure' || !!r.edgeCode, {
  message: 'choose the affected road segment for a road closure',
  path: ['edgeCode'],
});

/** Public representation of a report: no free text (may contain personal details). */
export const redactReport = (r) => ({
  id: r.id, type: r.type, regionCode: r.regionCode, edgeCode: r.edgeCode, severity: r.severity,
  reportedAt: r.reportedAt, reportCount: 1 + (r.duplicateCount || 0),
});
