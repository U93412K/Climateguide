import { clamp, round, isFiniteNumber } from '../lib/geo.js';

/**
 * Explainable flood / extreme-rainfall risk model.
 *
 *   rainIntensity   = 0.6 * min(rain24h/150mm, 1) + 0.4 * min(rain72h/300mm, 1)
 *   susceptibility  = 0.35*floodHistory + 0.25*(1-drainage) + 0.20*riverProximity + 0.20*lowElevation
 *   score           = rainIntensity * (0.4 + 0.6*susceptibility) + 0.05*humidity*rainIntensity + reportBump
 *
 * This is an uncalibrated heuristic, NOT a trained hydrological model. Output is an estimate of
 * relative risk, so confidence is capped at "medium" and every result carries that caveat.
 */

export const rainfallCategory = (mm24) => {
  if (mm24 >= 204.5) return 'extremely heavy';
  if (mm24 >= 115.6) return 'very heavy';
  if (mm24 >= 64.5) return 'heavy';
  if (mm24 >= 15.6) return 'moderate';
  return 'light or none';
};

export const classify = (score, thresholds) =>
  score >= thresholds.high ? 'high' : score >= thresholds.medium ? 'medium' : 'low';

const summariseWeather = (wx) =>
  wx && {
    source: wx.source, scenario: wx.scenario ?? null, observedAt: wx.observedAt,
    temperatureC: wx.temperatureC, humidity: wx.humidity, condition: wx.condition,
    rain1h: wx.rain1h, rain24h: wx.rain24h, rain72h: wx.rain72h, missing: wx.missing ?? [],
  };

export function assessRegionRisk(region, weather, activeReports, assumptions) {
  const base = { regionCode: region.code, name: region.name, state: region.state, center: region.center, weather: summariseWeather(weather) };

  if (!weather || !isFiniteNumber(weather.rain24h)) {
    return {
      ...base, level: 'unavailable', score: null, confidence: 'none', incomplete: true, factors: null,
      reasons: ['Forecast rainfall data is unavailable for this region, so no risk level is shown.'],
    };
  }

  const incomplete = !isFiniteNumber(weather.rain72h);
  const rain24n = clamp(weather.rain24h / 150);
  const rainIntensity = incomplete ? rain24n : 0.6 * rain24n + 0.4 * clamp(weather.rain72h / 300);
  const humidity = isFiniteNumber(weather.humidity) ? clamp((weather.humidity - 60) / 40) : 0;
  const susceptibility =
    0.35 * region.floodHistory + 0.25 * (1 - region.drainage) +
    0.2 * (1 - clamp(region.riverDistanceKm / 20)) + 0.2 * (1 - clamp(region.elevationM / 300));

  const floodReports = activeReports.filter((r) => r.regionCode === region.code && r.type === 'flooding');
  const reportCount = floodReports.reduce((n, r) => n + 1 + (r.duplicateCount || 0), 0);
  const reportBump = Math.min(0.1, 0.02 * reportCount);

  const score = clamp(rainIntensity * (0.4 + 0.6 * susceptibility) + 0.05 * humidity * rainIntensity + reportBump);
  const level = classify(score, assumptions.riskThresholds);

  const reasons = [`Forecast rainfall ${weather.rain24h} mm in 24 h (${rainfallCategory(weather.rain24h)}).`];
  if (isFiniteNumber(weather.rain72h)) reasons.push(`${weather.rain72h} mm expected over 72 h.`);
  if (susceptibility >= 0.6) reasons.push('Terrain/drainage make this region highly flood-prone (low elevation, river proximity, flood history).');
  else if (susceptibility >= 0.4) reasons.push('Moderate terrain and drainage susceptibility to flooding.');
  if (reportCount > 0) reasons.push(`${reportCount} active ground report(s) of flooding in this region.`);
  if (incomplete) reasons.push('72 h forecast missing: estimate based on 24 h rainfall only and may understate the risk.');

  return {
    ...base, level, score: round(score, 2), confidence: incomplete ? 'low' : 'medium', incomplete,
    factors: { rainIntensity: round(rainIntensity, 2), susceptibility: round(susceptibility, 2), humidity: round(humidity, 2), reportBump: round(reportBump, 2) },
    reasons,
  };
}
