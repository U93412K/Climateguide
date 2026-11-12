import { dedupeKeyOf } from '../data/seed.js';

export const REPORT_TYPES = ['flooding', 'road_closure', 'landslide', 'bridge_damage', 'other'];

/**
 * Find an existing ACTIVE report that describes the same incident (same type + road segment +
 * region) inside the de-duplication window. Returns the existing report or null.
 */
export function findDuplicate(existing, candidate, now, windowHours) {
  const key = dedupeKeyOf(candidate);
  const cutoff = now.getTime() - windowHours * 3600 * 1000;
  return (
    existing.find(
      (r) => r.status === 'active' && (r.dedupeKey || dedupeKeyOf(r)) === key && new Date(r.reportedAt).getTime() >= cutoff,
    ) || null
  );
}

/** Create a report, or merge into an existing duplicate. Returns { report, duplicate }. */
export async function submitReport(store, input, assumptions, now = new Date(), source = 'user') {
  const candidate = {
    type: input.type,
    regionCode: input.regionCode,
    edgeCode: input.edgeCode || null,
    severity: input.severity,
    description: (input.description || '').trim(),
  };
  const dedupeKey = dedupeKeyOf(candidate);
  const same = await store.reports.find({ dedupeKey, status: 'active' });
  const dup = findDuplicate(same, candidate, now, assumptions.dedupeWindowHours);
  if (dup) {
    const updated = await store.reports.update(dup.id, {
      duplicateCount: (dup.duplicateCount || 0) + 1,
      severity: Math.max(dup.severity, candidate.severity),
      lastReportedAt: now,
    });
    return { report: updated, duplicate: true };
  }
  const report = await store.reports.insert({ ...candidate, dedupeKey, status: 'active', duplicateCount: 0, reportedAt: now, source });
  return { report, duplicate: false };
}
