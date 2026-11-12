import { clamp, isFiniteNumber } from '../lib/geo.js';

/**
 * Estimate people potentially needing assistance.
 *   exposed  = settlement population * floodProneShare
 *   expected = exposed * impactRate[riskLevel]        (range: expected * (1 +/- uncertainty))
 * Settlements without population data are listed as unknown and NEVER given a made-up number.
 */
export function estimateAffected(region, riskLevel, assumptions) {
  const rate = assumptions.impactRate?.[riskLevel] ?? 0;
  const u = assumptions.uncertainty;
  const notes = [];
  const settlements = region.settlements.map((s) => {
    const known = isFiniteNumber(s.population) && s.population >= 0;
    const share = isFiniteNumber(s.floodProneShare) ? clamp(s.floodProneShare) : 1;
    if (known && !isFiniteNumber(s.floodProneShare)) notes.push(`${s.name}: flood-prone share unknown, assumed 100% (conservative).`);
    if (!known) return { name: s.name, lat: s.lat, lon: s.lon, populationKnown: false, population: null, floodProneShare: share, exposed: null, expected: null, min: null, max: null };
    const exposed = s.population * share;
    const expected = Math.round(exposed * rate);
    return {
      name: s.name, lat: s.lat, lon: s.lon, populationKnown: true, population: s.population, floodProneShare: share,
      exposed: Math.round(exposed), expected, min: Math.round(expected * (1 - u)), max: Math.round(expected * (1 + u)),
    };
  });

  const known = settlements.filter((s) => s.populationKnown);
  const unknown = settlements.filter((s) => !s.populationKnown).map((s) => s.name);
  const sum = (k) => known.reduce((a, s) => a + s[k], 0);
  if (unknown.length) notes.push(`No population data for: ${unknown.join(', ')}. Totals exclude these settlements and are a lower bound.`);

  return {
    regionCode: region.code, riskLevel, impactRate: rate, uncertainty: u, settlements,
    available: known.length > 0,
    partial: unknown.length > 0,
    unknownSettlements: unknown,
    totals: known.length ? { population: sum('population'), exposed: sum('exposed'), expected: sum('expected'), min: sum('min'), max: sum('max') } : null,
    notes,
  };
}
