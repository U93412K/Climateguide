import { createMemoryStore } from './memory.js';
import { createMongoStore } from './mongo.js';

export function createStore(config) {
  if (config.dataStore === 'memory') return createMemoryStore();
  if (config.dataStore === 'mongo') return createMongoStore(config.mongoUri);
  throw new Error(`Unknown DATA_STORE "${config.dataStore}" (use "mongo" or "memory")`);
}

export async function getAssumptions(store, defaults) {
  const row = await store.settings.findOne({ key: 'assumptions' });
  return { ...defaults, ...(row?.value || {}) };
}
