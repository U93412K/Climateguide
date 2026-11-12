import { UNITS } from './demand.js';

const fmt = (n) => Number(n).toLocaleString('en-IN');

/** Deterministic plain-language briefing. Always available, built only from computed results. */
export function templateNarrative(r) {
  const high = r.risks.filter((x) => x.level === 'high').map((x) => x.name);
  const med = r.risks.filter((x) => x.level === 'medium').map((x) => x.name);
  const unavailable = r.risks.filter((x) => x.level === 'unavailable').map((x) => x.name);
  const parts = [];
  const src = r.meta.weatherSource === 'sample' ? 'SAMPLE weather data' : 'live OpenWeather forecast data';
  parts.push(`Assessed ${r.risks.length} region(s) using ${src}. These are model estimates, not guaranteed outcomes.`);
  parts.push(high.length ? `High estimated flood risk: ${high.join(', ')}.` : 'No regions are at high estimated risk.');
  if (med.length) parts.push(`Medium estimated risk: ${med.join(', ')}.`);
  if (unavailable.length) parts.push(`Risk could not be assessed for ${unavailable.join(', ')} because weather data is missing.`);
  const t = r.totals;
  if (t.affectedExpected > 0) {
    parts.push(`About ${fmt(t.affectedExpected)} people (plausible range ${fmt(t.affectedMin)} to ${fmt(t.affectedMax)}) may need assistance.`);
    parts.push(`After local stock, the shortage is ${fmt(t.shortage.food)} ${UNITS.food} of food, ${fmt(t.shortage.water)} ${UNITS.water} of water and ${fmt(t.shortage.medicine)} ${UNITS.medicine} of medicine.`);
    parts.push(`${r.allocations.length} supplier delivery(ies) are proposed; ${r.unresolved.length ? `${r.unresolved.length} shortage line(s) remain unresolved and need attention` : 'all estimated shortages can be covered from available stock'}.`);
  } else {
    parts.push('No affected-population estimate is available, so no resource plan was generated.');
  }
  const critical = r.warnings.filter((w) => w.level === 'critical').length;
  if (critical) parts.push(`${critical} critical warning(s) require review before any approval.`);
  parts.push('This plan must be reviewed and approved by an authorised person before any dispatch.');
  return parts.join(' ');
}

/**
 * Optional AI-written briefing. The model only rephrases already-computed figures; it never
 * produces numbers that feed the plan. Falls back to the template on any failure.
 */
export async function buildNarrative(result, { apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  const fallback = { text: templateNarrative(result), source: 'template' };
  if (!apiKey) return fallback;

  const facts = {
    weatherSource: result.meta.weatherSource,
    risks: result.risks.map((x) => ({ region: x.name, level: x.level, confidence: x.confidence })),
    totals: result.totals,
    unresolved: result.unresolved,
    allocations: result.allocations.map((a) => ({ supplier: a.supplierName, region: a.regionCode, items: a.items, routeStatus: a.route.status })),
    warnings: result.warnings.map((w) => w.message),
  };
  const prompt =
    'You are drafting a short briefing (max 150 words, plain prose, no markdown) for an emergency coordinator, ' +
    'based ONLY on this JSON of computed results. Do not invent or alter any number or place. ' +
    'Describe predictions as estimates, mention key uncertainties and unresolved shortages, and end by stating that ' +
    'human approval is required before dispatch.\n\n' + JSON.stringify(facts);
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ...fallback, note: `AI briefing unavailable (HTTP ${res.status}); showing template briefing.` };
    const data = await res.json();
    const text = data?.content?.find((c) => c.type === 'text')?.text?.trim();
    if (!text) return { ...fallback, note: 'AI briefing returned no text; showing template briefing.' };
    return { text, source: 'ai', model };
  } catch {
    return { ...fallback, note: 'AI briefing unavailable; showing template briefing.' };
  }
}
