import { config } from './config.js';
import { createStore } from './store/index.js';
import { createWeatherProvider } from './services/weather.js';
import { seedStore } from './data/seed.js';
import { createApp } from './app.js';

async function main() {
  const store = createStore(config);
  try {
    await store.connect();
  } catch (err) {
    console.error(`\n[startup] Could not connect to MongoDB (${err.message}).`);
    console.error('  - Start MongoDB (e.g. `docker compose up -d mongo`) and check MONGODB_URI, or');
    console.error('  - run without a database using DATA_STORE=memory (demo mode, data is not saved).\n');
    process.exit(1);
  }

  if (config.autoSeed) {
    if (!config.seedPassword) {
      console.warn('[seed] AUTO_SEED is on but SEED_PASSWORD is not set; skipping seeding.');
    } else {
      const { seeded } = await seedStore(store, { password: config.seedPassword });
      if (seeded) console.log('[seed] Loaded demo regions, suppliers, road network, reports and demo users.');
    }
  }

  const weather = createWeatherProvider({ apiKey: config.openWeatherKey, cacheMinutes: config.weatherCacheMinutes });
  const app = createApp({ store, config, weather });
  app.listen(config.port, () => {
    console.log(`ClimateGuide API listening on http://localhost:${config.port}  (store: ${store.kind})`);
    if (store.kind === 'memory') console.log('  Demo mode: data is held in memory and resets on restart.');
    if (!config.openWeatherKey) console.log('  OPENWEATHER_API_KEY not set: live weather disabled, sample scenarios available.');
    if (!config.anthropicKey) console.log('  ANTHROPIC_API_KEY not set: plan briefings use the built-in template.');
    if (config.usingDemoPassword) console.log('  Demo accounts use the documented demo password (set SEED_PASSWORD to change).');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
