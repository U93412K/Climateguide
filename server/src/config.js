import 'dotenv/config';
import crypto from 'node:crypto';

// Empty strings in .env are treated as "not set".
export const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const nodeEnv = env('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

let jwtSecret = env('JWT_SECRET');
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set: using an ephemeral secret (logins reset on restart).');
}

// Demo accounts need a password. Outside production we fall back to a documented demo-only value.
const DEMO_DEFAULT_PASSWORD = 'Demo@12345';
const seedPassword = env('SEED_PASSWORD', isProd ? undefined : DEMO_DEFAULT_PASSWORD);

export const config = {
  nodeEnv,
  isProd,
  port: Number(env('PORT', 5000)),
  dataStore: env('DATA_STORE', 'mongo'), // 'mongo' | 'memory'
  mongoUri: env('MONGODB_URI', 'mongodb://127.0.0.1:27017/climateguide'),
  jwtSecret,
  jwtExpiresIn: env('JWT_EXPIRES_IN', '8h'),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  openWeatherKey: env('OPENWEATHER_API_KEY'),
  weatherCacheMinutes: Number(env('WEATHER_CACHE_MINUTES', 10)),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
  seedPassword,
  usingDemoPassword: seedPassword === DEMO_DEFAULT_PASSWORD,
  autoSeed: env('AUTO_SEED', isProd ? 'false' : 'true') === 'true',
  planMaxAgeHours: Number(env('PLAN_MAX_AGE_HOURS', 6)),
  clientDist: env('CLIENT_DIST', undefined),
};
