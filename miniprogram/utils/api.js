/**
 * 云函数调用封装 — 统一接口层
 *
 * 用法:
 *   const api = require('../../utils/api');
 *   const res = await api.inventory.list({ page: 1, pageSize: 20 });
 *   const res = await api.inventory.inbound({ part_no: 'PWR-001', ... });
 */

/**
 * 通用云函数调用
 */
async function callCloud(funcName, action, { body, query, params } = {}) {
  try {
    wx.showLoading({ title: '加载中...', mask: true });

    const res = await wx.cloud.callFunction({
      name: funcName,
      data: { action, body, query, params },
    });

    wx.hideLoading();

    const result = res.result;
    if (!result) {
      throw new Error('云函数返回为空');
    }

    // 业务错误
    if (result.code !== 0) {
      const statusCode = result._statusCode || 400;
      if (statusCode === 401 || statusCode === 403) {
        wx.showToast({ title: result.message || '权限不足', icon: 'none' });
      }
      return result;
    }

    return result;
  } catch (err) {
    wx.hideLoading();
    console.error(`[api] ${funcName}/${action} error:`, err);
    wx.showToast({ title: '网络请求失败', icon: 'none' });
    return { code: 1, message: err.message || '网络请求失败' };
  }
}

/**
 * 静默调用（不显示 loading）
 */
async function callCloudSilent(funcName, action, { body, query, params } = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name: funcName,
      data: { action, body, query, params },
    });
    return res.result || { code: 1, message: '云函数返回为空' };
  } catch (err) {
    console.error(`[api] ${funcName}/${action} error:`, err);
    return { code: 1, message: err.message || '网络请求失败' };
  }
}

// ── 认证模块 ──────────────────────────────────────────
const auth = {
  wxLogin() {
    return callCloud('auth', 'POST /wx-login');
  },
  bind(username, password) {
    return callCloud('auth', 'POST /bind', { body: { username, password } });
  },
  unbind(username) {
    return callCloud('auth', 'POST /unbind', { body: { username } });
  },
};

// ── 库存模块 ──────────────────────────────────────────
const inventory = {
  list(query = {}) {
    return callCloud('inventory', 'GET /', { query });
  },
  inbound(data) {
    return callCloud('inventory', 'POST /inbound', { body: data });
  },
  edit(id, data) {
    return callCloud('inventory', `PATCH /${id}`, { body: data, params: { id } });
  },
  scan(sn) {
    return callCloud('inventory', `GET /scan/${sn}`, { params: { sn } });
  },
  batchImport(items) {
    return callCloud('inventory', 'POST /batch-import', { body: { items } });
  },
};

// ── 备件类型模块 ──────────────────────────────────────
const partTypes = {
  list(query = {}) {
    return callCloud('partTypes', 'GET /', { query });
  },
  create(data) {
    return callCloud('partTypes', 'POST /', { body: data });
  },
  update(partNo, data) {
    return callCloud('partTypes', `PATCH /${partNo}`, { body: data, params: { part_no: partNo } });
  },
  remove(partNo) {
    return callCloud('partTypes', `DELETE /${partNo}`, { params: { part_no: partNo } });
  },
};

// ── 申请模块 ──────────────────────────────────────────
const requests = {
  create(data) {
    return callCloud('requests', 'POST /', { body: data });
  },
  list(query = {}) {
    return callCloud('requests', 'GET /', { query });
  },
  detail(id) {
    return callCloud('requests', `GET /${id}`, { params: { id } });
  },
  approve(id, partialItems) {
    const body = partialItems ? { partial_items: partialItems } : {};
    return callCloud('requests', `POST /${id}/approve`, { body, params: { id } });
  },
  reject(id, reason) {
    return callCloud('requests', `POST /${id}/reject`, { body: { reason }, params: { id } });
  },
  cancel(id) {
    return callCloud('requests', `POST /${id}/cancel`, { params: { id } });
  },
};

// ── 分析模块 ──────────────────────────────────────────
const analytics = {
  kpi() {
    return callCloudSilent('analytics', 'GET /kpi');
  },
  distribution() {
    return callCloudSilent('analytics', 'GET /distribution');
  },
  safetyStock() {
    return callCloudSilent('analytics', 'GET /safety-stock');
  },
  trend() {
    return callCloudSilent('analytics', 'GET /trend');
  },
  consumption(months = 6) {
    return callCloudSilent('analytics', 'GET /consumption', { query: { months } });
  },
  age(staleDays = 90) {
    return callCloudSilent('analytics', 'GET /age', { query: { stale_days: staleDays } });
  },
  turnover(months = 6) {
    return callCloudSilent('analytics', 'GET /turnover', { query: { months } });
  },
};

// ── 日志模块 ──────────────────────────────────────────
const logs = {
  list(query = {}) {
    return callCloud('logs', 'GET /', { query });
  },
};

module.exports = {
  auth,
  inventory,
  partTypes,
  requests,
  analytics,
  logs,
  callCloud,
  callCloudSilent,
};
