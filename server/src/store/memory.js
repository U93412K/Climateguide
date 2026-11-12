import crypto from 'node:crypto';

/**
 * In-memory collection implementing the same tiny interface as the MongoDB one.
 * Used for DATA_STORE=memory (zero-setup demo) and for automated tests.
 * Data is lost when the process exits.
 */
function memoryCollection() {
  let rows = new Map();
  const out = (r) => (r ? structuredClone(r) : null);
  const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);

  return {
    async find(filter = {}, { sort, limit } = {}) {
      let list = [...rows.values()].filter((r) => matches(r, filter));
      if (sort) {
        const [[field, dir]] = Object.entries(sort);
        list.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * dir);
      }
      if (limit) list = list.slice(0, limit);
      return list.map(out);
    },
    async findOne(filter) {
      for (const r of rows.values()) if (matches(r, filter)) return out(r);
      return null;
    },
    async findById(id) {
      return out(rows.get(String(id)));
    },
    async insert(doc) {
      const now = new Date();
      const row = { ...structuredClone(doc), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      rows.set(row.id, row);
      return out(row);
    },
    async insertMany(docs) {
      const created = [];
      for (const d of docs) created.push(await this.insert(d));
      return created;
    },
    async update(id, patch) {
      const row = rows.get(String(id));
      if (!row) return null;
      Object.assign(row, structuredClone(patch), { updatedAt: new Date() });
      return out(row);
    },
    async remove(id) {
      return rows.delete(String(id));
    },
    async count(filter = {}) {
      return [...rows.values()].filter((r) => matches(r, filter)).length;
    },
    async clear() {
      rows = new Map();
    },
  };
}

export const COLLECTIONS = ['users', 'regions', 'suppliers', 'nodes', 'edges', 'reports', 'plans', 'settings', 'audit'];

export function createMemoryStore() {
  const store = { kind: 'memory' };
  for (const name of COLLECTIONS) store[name] = memoryCollection();
  store.connect = async () => {};
  store.close = async () => {};
  store.reset = async () => {
    for (const name of COLLECTIONS) await store[name].clear();
  };
  return store;
}
