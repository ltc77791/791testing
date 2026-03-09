/**
 * 数据库适配层 — 统一 MongoDB 原生驱动 和 微信云数据库 API
 *
 * 本地开发 (mode='local'):
 *   直接委托给 db.js 的 getDB()，零开销透传 MongoDB 原生驱动
 *
 * 云函数 (mode='cloud'):
 *   将 wx-server-sdk 的云数据库 API 包装成 MongoDB 原生驱动兼容接口
 *   handlers/ 层无需改动任何一行代码
 *
 * 用法:
 *   const { getDB } = require('./db-adapter');  // 替代 require('./db')
 *   const db = getDB();
 *   await db.collection('inventory').findOne({ serial_number: 'SN001' });
 */

const mode = process.env.DB_MODE || 'local'; // 'local' | 'cloud'

// ─── 本地模式：直接透传 MongoDB 原生驱动 ───────────────────────────
if (mode === 'local') {
  const { getDB, connectDB, closeDB, initCollections } = require('./db');
  module.exports = { getDB, connectDB, closeDB, initCollections, mode };
} else {
  // ─── 云模式：适配 wx-server-sdk 为 MongoDB 兼容接口 ──────────────

  // wx-server-sdk 在云函数运行时可用
  // eslint-disable-next-line
  const cloud = require('wx-server-sdk');

  let _inited = false;

  function initCloud(env) {
    if (_inited) return;
    cloud.init({ env: env || cloud.DYNAMIC_CURRENT_ENV });
    _inited = true;
  }

  /**
   * 将 wx-server-sdk 的云数据库 collection 包装为 MongoDB 兼容接口
   * 支持 handlers 中实际使用的所有方法
   */
  class CloudCollection {
    constructor(name) {
      this._col = cloud.database().collection(name);
      this._name = name;
    }

    // ── findOne(filter) ──────────────────────────────────
    async findOne(filter) {
      const wxFilter = _toWxFilter(filter);
      const { data } = await this._col.where(wxFilter).limit(1).get();
      return data.length > 0 ? _normalizeDoc(data[0]) : null;
    }

    // ── find(filter) → 返回 Cursor-like 对象 ─────────────
    find(filter) {
      return new CloudCursor(this._col, filter);
    }

    // ── insertOne(doc) ───────────────────────────────────
    async insertOne(doc) {
      const toInsert = { ...doc };
      // 云数据库使用 _id 字段，如果外部传入了 _id 则保留
      const { _id: insertedId } = await this._col.add({ data: toInsert });
      return { insertedId, acknowledged: true };
    }

    // ── updateOne(filter, update) ────────────────────────
    async updateOne(filter, update) {
      const wxFilter = _toWxFilter(filter);
      const updateData = _toWxUpdate(update);
      const { stats } = await this._col.where(wxFilter).limit(1).update({ data: updateData });
      return { modifiedCount: stats.updated, matchedCount: stats.updated };
    }

    // ── updateMany(filter, update) ───────────────────────
    async updateMany(filter, update) {
      const wxFilter = _toWxFilter(filter);
      const updateData = _toWxUpdate(update);
      const { stats } = await this._col.where(wxFilter).update({ data: updateData });
      return { modifiedCount: stats.updated, matchedCount: stats.updated };
    }

    // ── deleteOne(filter) ────────────────────────────────
    async deleteOne(filter) {
      const wxFilter = _toWxFilter(filter);
      const { stats } = await this._col.where(wxFilter).limit(1).remove();
      return { deletedCount: stats.removed };
    }

    // ── deleteMany(filter) ───────────────────────────────
    async deleteMany(filter) {
      const wxFilter = _toWxFilter(filter);
      const { stats } = await this._col.where(wxFilter).remove();
      return { deletedCount: stats.removed };
    }

    // ── countDocuments(filter) ────────────────────────────
    async countDocuments(filter) {
      const wxFilter = _toWxFilter(filter || {});
      const { total } = await this._col.where(wxFilter).count();
      return total;
    }

    // ── aggregate(pipeline) → 返回 AggCursor ─────────────
    aggregate(pipeline) {
      return new CloudAggCursor(this._col, pipeline);
    }

    // ── createIndex() — 云数据库索引在控制台管理，此处为兼容空操作 ──
    async createIndex() {
      return;
    }
  }

  /**
   * 链式 Cursor 模拟 MongoDB 的 find().sort().skip().limit().toArray()
   */
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
        const orderBy = {};
        for (const [k, v] of Object.entries(this._sortObj)) {
          orderBy[k] = v === 1 ? 'asc' : 'desc';
        }
        for (const [field, dir] of Object.entries(orderBy)) {
          query = query.orderBy(field, dir);
        }
      }

      if (this._skipN > 0) query = query.skip(this._skipN);
      if (this._limitN > 0) query = query.limit(this._limitN);

      if (this._projection) {
        const fields = {};
        for (const [k, v] of Object.entries(this._projection)) {
          if (v === 0) fields[k] = false;
          else fields[k] = true;
        }
        query = query.field(fields);
      }

      // 云数据库单次 get 最多 100 条，需要分批拉取
      const allData = [];
      const batchSize = 100;
      const limit = this._limitN || Infinity;

      if (limit <= batchSize) {
        const { data } = await query.limit(limit).get();
        return data.map(_normalizeDoc);
      }

      // 分批拉取
      let fetched = 0;
      while (fetched < limit) {
        const batchLimit = Math.min(batchSize, limit - fetched);
        const { data } = await query.skip(this._skipN + fetched).limit(batchLimit).get();
        allData.push(...data);
        fetched += data.length;
        if (data.length < batchLimit) break; // 没有更多数据
      }

      return allData.map(_normalizeDoc);
    }
  }

  /**
   * 聚合管道 Cursor — 云数据库支持 aggregate
   */
  class CloudAggCursor {
    constructor(wxCol, pipeline) {
      this._wxCol = wxCol;
      this._pipeline = pipeline;
    }

    async toArray() {
      const { list } = await this._wxCol.aggregate()
        .pipeline(this._pipeline)
        .end();
      return list.map(_normalizeDoc);
    }
  }

  // ── 工具函数 ──────────────────────────────────────────

  const _ = cloud.database().command;

  /**
   * 将 MongoDB 风格的 filter 转为 wx-server-sdk where 条件
   * 支持: $in, $nin, $gt, $gte, $lt, $lte, $ne, $regex, $exists, $or
   */
  function _toWxFilter(filter) {
    if (!filter || Object.keys(filter).length === 0) return {};

    // 处理 $or
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

    // 非对象直接返回（精确匹配）
    if (typeof val !== 'object' || val instanceof Date) return val;

    // 数组直接返回
    if (Array.isArray(val)) return val;

    // MongoDB 操作符 → wx command
    const ops = Object.keys(val);
    if (ops.length === 0) return val;

    // 检查是否全为操作符
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
        case '$options': continue; // 已在 $regex 处理
        default: part = val; break;
      }
      cmd = cmd ? cmd.and(part) : part;
    }
    return cmd || val;
  }

  /**
   * 将 MongoDB update 操作符 ($set, $inc, $push, $unset) 转为云数据库 update data
   */
  function _toWxUpdate(update) {
    const data = {};

    if (update.$set) {
      Object.assign(data, update.$set);
    }

    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        data[k] = _.inc(v);
      }
    }

    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (v.$each) {
          data[k] = _.push(v.$each);
        } else {
          data[k] = _.push([v]);
        }
      }
    }

    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        data[k] = _.remove();
      }
    }

    return data;
  }

  /**
   * 将云数据库文档标准化为 MongoDB 风格
   * 云数据库的 _id 是字符串，MongoDB 的 _id 是 ObjectId
   */
  function _normalizeDoc(doc) {
    if (!doc) return doc;
    return doc; // 保持原样，handlers 中使用 _id 时兼容字符串
  }

  // ── 对外暴露与 db.js 相同的接口 ─────────────────────────

  class CloudDB {
    collection(name) {
      return new CloudCollection(name);
    }

    async listCollections() {
      // 云数据库不需要手动创建 collection
      return { toArray: async () => [] };
    }

    async createCollection() {
      // 云数据库自动创建
      return;
    }
  }

  let _cloudDB = null;

  function getDB() {
    if (!_cloudDB) {
      _cloudDB = new CloudDB();
    }
    return _cloudDB;
  }

  async function connectDB(env) {
    initCloud(env);
    return getDB();
  }

  async function closeDB() {
    // 云函数无需关闭连接
  }

  async function initCollections() {
    // 云数据库的 collection 和索引在微信控制台管理
    console.log('[cloud] Collections managed via WeChat console');
  }

  module.exports = { getDB, connectDB, closeDB, initCollections, initCloud, mode };
}
