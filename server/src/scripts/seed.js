/**
 * Usage:  npm run seed            seed only if the database is empty
 *         npm run seed -- --reset wipe ALL ClimateGuide collections, then seed (refuses in production)
 */
import { config } from '../config.js';
import { createStore } from '../store/index.js';
import { seedStore } from '../data/seed.js';

const reset = process.argv.includes('--reset');
if (reset && config.isProd) {
  console.error('Refusing to --reset in production.');
  process.exit(1);
}
if (config.dataStore === 'memory') {
  console.error('DATA_STORE=memory has no persistent database to seed (the server seeds memory on start). Use MongoDB for this script.');
  process.exit(1);
}
if (!config.seedPassword) {
  console.error('Set SEED_PASSWORD to seed demo users.');
  process.exit(1);
}

const store = createStore(config);
try {
  await store.connect();
  if (reset) await store.reset();
  const { seeded } = await seedStore(store, { password: config.seedPassword });
  console.log(seeded ? 'Seeded demo data.' : 'Database already has data. Nothing seeded (use --reset to start over).');
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await store.close();
}
