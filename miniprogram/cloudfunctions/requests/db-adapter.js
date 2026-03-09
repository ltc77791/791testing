/**
 * 数据库适配层 — 云函数专用 (wx-server-sdk → MongoDB 兼容接口)
 * 从 server/src/db-adapter.js 提取的云模式代码
 */

const cloud = require('wx-server-sdk');

let _inited = false;

function initCloud(env) {
  if (_inited) return;
  cloud.init({ env: env || cloud.DYNAMIC_CURRENT_ENV });
  _inited = true;
}

class CloudCollection {
  constructor(name) {
    this._col = cloud.database().collection(name);
    this._name = name;
  }

  async findOne(filter) {
    const wxFilter = _toWxFilter(filter);
    const { data } = await this._col.where(wxFilter).limit(1).get();
    return data.length > 0 ? data[0] : null;
  }

  find(filter) {
    return new CloudCursor(this._col, filter);
  }

  async insertOne(doc) {
    const toInsert = { ...doc };
    const { _id: insertedId } = await this._col.add({ data: toInsert });
    return { insertedId, acknowledged: true };
  }

  async insertMany(docs) {
    const results = [];
    for (const doc of docs) {
      const r = await this.insertOne(doc);
      results.push(r);
    }
    return { insertedCount: results.length };
  }

  async updateOne(filter, update) {
    const wxFilter = _toWxFilter(filter);
    const updateData = _toWxUpdate(update);
    const { stats } = await this._col.where(wxFilter).limit(1).update({ data: updateData });
    return { modifiedCount: stats.updated, matchedCount: stats.updated };
  }

  async updateMany(filter, update) {
    const wxFilter = _toWxFilter(filter);
    const updateData = _toWxUpdate(update);
    const { stats } = await this._col.where(wxFilter).update({ data: updateData });
    return { modifiedCount: stats.updated, matchedCount: stats.updated };
  }

  async deleteOne(filter) {
    const wxFilter = _toWxFilter(filter);
    const { stats } = await this._col.where(wxFilter).limit(1).remove();
    return { deletedCount: stats.removed };
  }

  async deleteMany(filter) {
    const wxFilter = _toWxFilter(filter);
    const { stats } = await this._col.where(wxFilter).remove();
    return { deletedCount: stats.removed };
  }

  async countDocuments(filter) {
    const wxFilter = _toWxFilter(filter || {});
    const { total } = await this._col.where(wxFilter).count();
    return total;
  }

  aggregate(pipeline) {
    return new CloudAggCursor(this._col, pipeline);
  }

  async createIndex() {
    return;
  }
}

class CloudCursor {
  constructor(wxCol, filter) {
    this._wxCol = wxCol;
    this._filter = filter || {};
    this._sortObj = null;
    this._skipN = 0;
    this._limitN = 0;
    this._projection = null;
  }

  sort(obj) { this._sortObj = obj; return this; }
  skip(n) { this._skipN = n; return this; }
  limit(n) { this._limitN = n; return this; }
  project(obj) { this._projection = obj; return this; }

  async toArray() {
    let query = this._wxCol.where(_toWxFilter(this._filter));

    if (this._sortObj) {
      for (const [field, v] of Object.entries(this._sortObj)) {
        query = query.orderBy(field, v === 1 ? 'asc' : 'desc');
      }
    }

    if (this._skipN > 0) query = query.skip(this._skipN);
    if (this._limitN > 0) query = query.limit(this._limitN);

    if (this._projection) {
      const fields = {};
      for (const [k, v] of Object.entries(this._projection)) {
        fields[k] = v !== 0;
      }
      query = query.field(fields);
    }

    const batchSize = 100;
    const limit = this._limitN || Infinity;

    if (limit <= batchSize) {
      const { data } = await query.limit(limit).get();
      return data;
    }

    const allData = [];
    let fetched = 0;
    while (fetched < limit) {
      const batchLimit = Math.min(batchSize, limit - fetched);
      const { data } = await query.skip(this._skipN + fetched).limit(batchLimit).get();
      allData.push(...data);
      fetched += data.length;
      if (data.length < batchLimit) break;
    }
    return allData;
  }
}

class CloudAggCursor {
  constructor(wxCol, pipeline) {
    this._wxCol = wxCol;
    this._pipeline = pipeline;
  }

  async toArray() {
    let agg = this._wxCol.aggregate();
    for (const stage of this._pipeline) {
      const [op] = Object.keys(stage);
      const methodName = op.replace('$', '');
      if (typeof agg[methodName] === 'function') {
        agg = agg[methodName](stage[op]);
      }
    }
    const { list } = await agg.end();
    return list;
  }
}

const _ = cloud.database().command;
const $ = cloud.database().command.aggregate;

function _toWxFilter(filter) {
  if (!filter || Object.keys(filter).length === 0) return {};
  if (filter.$or) {
    return _.or(filter.$or.map(sub => _toWxFilter(sub)));
  }
  const wxFilter = {};
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or') continue;
    wxFilter[key] = _convertValue(val);
  }
  return wxFilter;
}

function _convertValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object' || val instanceof Date) return val;
  if (Array.isArray(val)) return val;

  const ops = Object.keys(val);
  if (ops.length === 0) return val;
  const isAllOps = ops.every(k => k.startsWith('$'));
  if (!isAllOps) return val;

  let cmd = null;
  for (const [op, opVal] of Object.entries(val)) {
    let part;
    switch (op) {
      case '$in':    part = _.in(opVal); break;
      case '$nin':   part = _.nin(opVal); break;
      case '$gt':    part = _.gt(opVal); break;
      case '$gte':   part = _.gte(opVal); break;
      case '$lt':    part = _.lt(opVal); break;
      case '$lte':   part = _.lte(opVal); break;
      case '$ne':    part = _.neq(opVal); break;
      case '$exists': part = _.exists(opVal); break;
      case '$regex': {
        const flags = val.$options || '';
        part = _.regex({ regexp: opVal, options: flags });
        break;
      }
      case '$options': continue;
      default: part = val; break;
    }
    cmd = cmd ? cmd.and(part) : part;
  }
  return cmd || val;
}

function _toWxUpdate(update) {
  const data = {};
  if (update.$set) Object.assign(data, update.$set);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      data[k] = _.inc(v);
    }
  }
  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push)) {
      data[k] = v.$each ? _.push(v.$each) : _.push([v]);
    }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) {
      data[k] = _.remove();
    }
  }
  return data;
}

class CloudDB {
  collection(name) {
    return new CloudCollection(name);
  }
}

let _cloudDB = null;

function getDB() {
  if (!_cloudDB) _cloudDB = new CloudDB();
  return _cloudDB;
}

async function connectDB(env) {
  initCloud(env);
  return getDB();
}

module.exports = { getDB, connectDB, initCloud };
