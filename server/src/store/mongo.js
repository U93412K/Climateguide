import mongoose from 'mongoose';
import { COLLECTIONS } from './memory.js';

/**
 * MongoDB-backed collections (Mongoose). Documents are intentionally schema-flexible
 * (strict: false) because plans embed large computed results; key fields are indexed and
 * validated at the API layer with zod.
 */
const INDEXES = {
  users: [[{ email: 1 }, { unique: true }]],
  regions: [[{ code: 1 }, { unique: true }]],
  suppliers: [[{ code: 1 }, { unique: true }]],
  nodes: [[{ code: 1 }, { unique: true }]],
  edges: [[{ code: 1 }, { unique: true }]],
  reports: [[{ dedupeKey: 1, status: 1 }], [{ reportedAt: -1 }]],
  plans: [[{ number: 1 }, { unique: true }], [{ createdAt: -1 }]],
  settings: [[{ key: 1 }, { unique: true }]],
  audit: [[{ createdAt: -1 }]],
};

const toPlain = (doc) => {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
};

function mongoCollection(name) {
  const schema = new mongoose.Schema({}, { strict: false, timestamps: true, minimize: false });
  for (const [fields, opts] of INDEXES[name] || []) schema.index(fields, opts);
  const Model = mongoose.models[`cg_${name}`] || mongoose.model(`cg_${name}`, schema, `cg_${name}`);
  const validId = (id) => mongoose.isValidObjectId(id);

  return {
    Model,
    async find(filter = {}, { sort, limit } = {}) {
      let q = Model.find(filter);
      if (sort) q = q.sort(sort);
      if (limit) q = q.limit(limit);
      return (await q.lean()).map(toPlain);
    },
    async findOne(filter) {
      return toPlain(await Model.findOne(filter).lean());
    },
    async findById(id) {
      if (!validId(id)) return null;
      return toPlain(await Model.findById(id).lean());
    },
    async insert(doc) {
      const created = await Model.create(doc);
      return toPlain(created.toObject());
    },
    async insertMany(docs) {
      const created = await Model.insertMany(docs);
      return created.map((d) => toPlain(d.toObject()));
    },
    async update(id, patch) {
      if (!validId(id)) return null;
      return toPlain(await Model.findByIdAndUpdate(id, { $set: patch }, { new: true, lean: true }));
    },
    async remove(id) {
      if (!validId(id)) return false;
      return !!(await Model.findByIdAndDelete(id));
    },
    async count(filter = {}) {
      return Model.countDocuments(filter);
    },
    async clear() {
      await Model.deleteMany({});
    },
  };
}

export function createMongoStore(uri) {
  const store = { kind: 'mongo' };
  for (const name of COLLECTIONS) store[name] = mongoCollection(name);
  store.connect = async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all(COLLECTIONS.map((n) => store[n].Model.init()));
  };
  store.close = async () => mongoose.disconnect();
  store.reset = async () => {
    for (const name of COLLECTIONS) await store[name].clear();
  };
  return store;
}
