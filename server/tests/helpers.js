import { createMemoryStore } from '../src/store/memory.js';
import { seedStore, DEFAULT_ASSUMPTIONS } from '../src/data/seed.js';
import { createApp } from '../src/app.js';
import { createWeatherProvider } from '../src/services/weather.js';
import { AppError } from '../src/lib/errors.js';

export const TEST_PASSWORD = 'Test@pass-123';
export const testConfig = {
  isProd: false, corsOrigin: 'http://localhost:5173', jwtSecret: 'test-secret-not-for-production',
  jwtExpiresIn: '1h', planMaxAgeHours: 6, anthropicKey: undefined, anthropicModel: 'test',
  usingDemoPassword: false, seedPassword: TEST_PASSWORD, clientDist: '/nonexistent',
};

export async function seededStore() {
  const store = createMemoryStore();
  await seedStore(store, { password: TEST_PASSWORD });
  return store;
}

export async function pipelineData(store, overrides = {}) {
  return {
    regions: await store.regions.find(), suppliers: await store.suppliers.find(), nodes: await store.nodes.find(),
    edges: await store.edges.find(), reports: await store.reports.find(), assumptions: { ...DEFAULT_ASSUMPTIONS }, ...overrides,
  };
}

/** Weather provider whose "live" mode can be forced to fail, to test the fallback path. */
export function fakeWeather({ liveFails = false } = {}) {
  const sample = createWeatherProvider({});
  return {
    liveAvailable: true,
    async get(region, opts) {
      if (opts.source === 'live' && liveFails) throw new AppError(502, 'WEATHER_UNAVAILABLE', 'OpenWeather request failed (network/timeout).');
      return sample.get(region, { ...opts, source: 'sample' });
    },
  };
}

export async function startApp({ liveFails = false } = {}) {
  const store = await seededStore();
  const app = createApp({ store, config: testConfig, weather: fakeWeather({ liveFails }) });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const login = async (role) => {
    const r = await call('POST', '/api/auth/login', { body: { email: `${role}@climateguide.example`, password: TEST_PASSWORD } });
    return r.body.token;
  };
  return { store, call, login, close: () => new Promise((r) => server.close(r)) };
}
