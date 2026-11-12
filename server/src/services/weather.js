import { AppError } from '../lib/errors.js';
import { isFiniteNumber } from '../lib/geo.js';
import { extendScenarios } from '../data/india.js';

/**
 * Normalised weather observation used by the risk model:
 * { source, regionCode, observedAt, temperatureC, humidity, condition,
 *   rain1h, rain24h, rain72h, missing: string[] }
 * rain24h / rain72h are FORECAST accumulations (mm) from now. null = unavailable.
 */

// ---- Sample scenarios (offline demo + tests) ---------------------------------------------------
const w = (rain1h, rain24h, rain72h, temperatureC, humidity, condition) => ({
  rain1h, rain24h, rain72h, temperatureC, humidity, condition,
});

export const SCENARIOS = {
  'heavy-rain': {
    label: 'Heavy rainfall: flood event',
    regions: {
      DHE: w(14, 150, 270, 24, 95, 'Heavy intensity rain'),
      MAJ: w(16, 160, 280, 24, 96, 'Very heavy rain'),
      JOR: w(6, 70, 140, 25, 90, 'Moderate rain'),
      MOR: w(11, 125, 230, 25, 93, 'Heavy intensity rain'),
      GHY: w(7, 85, 150, 26, 90, 'Heavy intensity rain'),
      BAR: w(9, 100, 190, 26, 92, 'Heavy intensity rain'),
    },
  },
  'moderate-rain': {
    label: 'Moderate rainfall',
    regions: {
      DHE: w(3, 45, 90, 27, 82, 'Moderate rain'),
      MAJ: w(4, 55, 100, 27, 85, 'Moderate rain'),
      JOR: w(2, 25, 50, 28, 78, 'Light rain'),
      MOR: w(3, 40, 80, 28, 80, 'Moderate rain'),
      GHY: w(2, 30, 60, 29, 76, 'Light rain'),
      BAR: w(3, 38, 75, 28, 80, 'Moderate rain'),
    },
  },
  dry: {
    label: 'Dry conditions',
    regions: Object.fromEntries(
      ['DHE', 'MAJ', 'JOR', 'MOR', 'GHY', 'BAR'].map((c) => [c, w(0, 1, 3, 31, 55, 'Clear sky')]),
    ),
  },
  'incomplete-data': {
    label: 'Heavy rain with gaps in the feed',
    regions: {
      DHE: w(14, 150, 270, 24, 95, 'Heavy intensity rain'),
      MAJ: w(16, 160, 280, 24, 96, 'Very heavy rain'),
      JOR: w(6, 70, 140, 25, 90, 'Moderate rain'),
      MOR: w(11, 125, null, 25, 93, 'Heavy intensity rain'), // 72 h forecast missing
      GHY: w(7, 85, 150, 26, 90, 'Heavy intensity rain'),
      BAR: w(null, null, null, null, null, null), // no rainfall data at all
    },
  },
};

extendScenarios(SCENARIOS);

export const DEFAULT_SCENARIO = 'heavy-rain';

const missingOf = (o) =>
  ['rain24h', 'rain72h', 'humidity', 'temperatureC'].filter((k) => !isFiniteNumber(o[k]));

export function sampleWeather(region, scenarioId = DEFAULT_SCENARIO, now = new Date()) {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new AppError(422, 'UNKNOWN_SCENARIO', `Unknown sample scenario "${scenarioId}"`);
  const d = scenario.regions[region.code];
  if (!d) throw new AppError(422, 'NO_SAMPLE_DATA', `No sample weather for ${region.code}`);
  const obs = {
    source: 'sample', scenario: scenarioId, regionCode: region.code, observedAt: now.toISOString(),
    temperatureC: d.temperatureC, humidity: d.humidity, condition: d.condition,
    rain1h: d.rain1h, rain24h: d.rain24h, rain72h: d.rain72h,
  };
  obs.missing = missingOf(obs);
  return obs;
}

// ---- Live data: OpenWeather free-tier endpoints --------------------------------------------------
const OWM = 'https://api.openweathermap.org/data/2.5';

async function getJson(url, fetchImpl, label) {
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    // Never include the URL: it contains the API key.
    throw new AppError(502, 'WEATHER_UNAVAILABLE', `OpenWeather ${label} request failed (network/timeout).`);
  }
  if (res.status === 401) throw new AppError(502, 'WEATHER_UNAVAILABLE', 'OpenWeather rejected the API key (401).');
  if (res.status === 429) throw new AppError(502, 'WEATHER_UNAVAILABLE', 'OpenWeather rate limit reached (429).');
  if (!res.ok) throw new AppError(502, 'WEATHER_UNAVAILABLE', `OpenWeather ${label} returned HTTP ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new AppError(502, 'WEATHER_UNAVAILABLE', `OpenWeather ${label} returned an unreadable response.`);
  }
}

/** Convert OpenWeather current + 3-hourly forecast payloads into our normalised shape. */
export function normaliseOpenWeather(region, current, forecast, now = new Date()) {
  const list = Array.isArray(forecast?.list) ? forecast.list : [];
  const sumRain = (steps) => list.slice(0, steps).reduce((a, e) => a + (Number(e?.rain?.['3h']) || 0), 0);
  // The forecast omits "rain" when no rain is expected, so absent = 0, but only if enough steps exist.
  const rain24h = list.length >= 8 ? Math.round(sumRain(8) * 10) / 10 : null;
  const rain72h = list.length >= 24 ? Math.round(sumRain(24) * 10) / 10 : null;
  const obs = {
    source: 'live', regionCode: region.code, observedAt: now.toISOString(),
    temperatureC: isFiniteNumber(current?.main?.temp) ? current.main.temp : null,
    humidity: isFiniteNumber(current?.main?.humidity) ? current.main.humidity : null,
    condition: current?.weather?.[0]?.description ?? null,
    rain1h: current ? Number(current?.rain?.['1h']) || 0 : null,
    rain24h, rain72h,
  };
  obs.missing = missingOf(obs);
  return obs;
}

export function createWeatherProvider({ apiKey, fetchImpl = globalThis.fetch, cacheMinutes = 10 } = {}) {
  const cache = new Map();

  async function live(region, now) {
    if (!apiKey) {
      throw new AppError(503, 'WEATHER_NOT_CONFIGURED',
        'Live weather needs OPENWEATHER_API_KEY. Switch to sample data or add a key.');
    }
    const key = region.code;
    const hit = cache.get(key);
    if (hit && now - hit.at < cacheMinutes * 60000) return hit.value;
    const q = `lat=${region.center.lat}&lon=${region.center.lon}&units=metric&appid=${encodeURIComponent(apiKey)}`;
    const [current, forecast] = await Promise.all([
      getJson(`${OWM}/weather?${q}`, fetchImpl, 'current-weather'),
      getJson(`${OWM}/forecast?${q}`, fetchImpl, 'forecast'),
    ]);
    const value = normaliseOpenWeather(region, current, forecast, now);
    cache.set(key, { at: now.getTime(), value });
    return value;
  }

  return {
    liveAvailable: !!apiKey,
    async get(region, { source = 'sample', scenario = DEFAULT_SCENARIO, now = new Date() } = {}) {
      if (source === 'live') return live(region, now);
      return sampleWeather(region, scenario, now);
    },
  };
}
