/**
 * HTTP API 调用封装 — 统一接口层
 *
 * 7-5/7-6 改造: wx.cloud.callFunction → wx.request + JWT 认证
 * 所有页面通过此模块调用后端，页面代码无需改动。
 *
 * 用法:
 *   const api = require('../../utils/api');
 *   const res = await api.inventory.list({ page: 1, pageSize: 20 });
 */

// 后端基础地址 — 只需维护这一处
// 开发/真机调试: http://localhost:5501 或 http://你的局域网IP:5501
// 上线时替换为正式域名: https://your-domain.com
const BASE_URL = 'http://localhost:5501';

/**
 * 从本地存储获取 JWT token
 */
function getToken() {
  return wx.getStorageSync('token') || '';
}

/**
 * 保存 JWT token 到本地存储
 */
function setToken(token) {
  if (token) {
    wx.setStorageSync('token', token);
  }
}

/**
 * 清除 JWT token
 */
function clearToken() {
  wx.removeStorageSync('token');
}

/**
 * 封装 wx.request 为 Promise
 */
function request({ url, method = 'GET', data, showLoading = true }) {
  return new Promise((resolve, reject) => {
    if (showLoading) {
      wx.showLoading({ title: '加载中...', mask: true });
    }

    const token = getToken();
    const header = { 'Content-Type': 'application/json' };
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }

    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header,
      success(res) {
        if (showLoading) wx.hideLoading();

        const statusCode = res.statusCode;
        const result = res.data;

        if (statusCode === 401) {
          // Token 过期或无效，清除并跳转登录
          clearToken();
          const app = getApp();
          if (app) {
            app.globalData.user = null;
            app.globalData.isLoggedIn = false;
          }
          wx.showToast({ title: result.message || '登录已过期', icon: 'none' });
          return resolve({ code: 1, message: result.message || '登录已过期', _statusCode: 401 });
        }

        if (statusCode === 403) {
          wx.showToast({ title: result.message || '权限不足', icon: 'none' });
          return resolve({ code: 1, message: result.message || '权限不足', _statusCode: 403 });
        }

        // 统一返回格式，兼容现有页面代码
        resolve(result);
      },
      fail(err) {
        if (showLoading) wx.hideLoading();
        console.error('[api] request error:', url, err);
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        reject({ code: 1, message: err.errMsg || '网络请求失败' });
      },
    });
  });
}

/**
 * 静默请求（不显示 loading）
 */
function requestSilent(opts) {
  return request({ ...opts, showLoading: false });
}

/**
 * 构建 query string
 */
function toQueryString(query) {
  if (!query || Object.keys(query).length === 0) return '';
  const parts = [];
  for (const [key, val] of Object.entries(query)) {
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── 认证模块 ──────────────────────────────────────────
const auth = {
  /**
   * 微信登录（wx.login code → 后端换 openId → JWT）
   */
  async wxLogin() {
    try {
      const { code } = await wx.login();
      const result = await requestSilent({
        url: '/api/auth/wx-login',
        method: 'POST',
        data: { code },
      });
      if (result.code === 0 && result.data && result.data.token) {
        setToken(result.data.token);
      }
      return result;
    } catch (err) {
      console.error('[api] wxLogin error:', err);
      return { code: 1, message: err.message || '网络请求失败' };
    }
  },

  /**
   * 绑定系统账号
   */
  async bind(username, password) {
    try {
      const { code } = await wx.login();
      const result = await request({
        url: '/api/auth/wx-bind',
        method: 'POST',
        data: { code, username, password },
      });
      if (result.code === 0 && result.data && result.data.token) {
        setToken(result.data.token);
      }
      return result;
    } catch (err) {
      console.error('[api] bind error:', err);
      return { code: 1, message: err.message || '网络请求失败' };
    }
  },

  /**
   * 解绑微信
   */
  unbind(username) {
    return request({
      url: '/api/auth/wx-unbind',
      method: 'POST',
      data: { username },
    });
  },
};

// ── 库存模块 ──────────────────────────────────────────
const inventory = {
  list(query = {}) {
    return request({ url: `/api/inventory${toQueryString(query)}` });
  },
  inbound(data) {
    return request({ url: '/api/inventory/inbound', method: 'POST', data });
  },
  edit(id, data) {
    return request({ url: `/api/inventory/${id}`, method: 'PATCH', data });
  },
  scan(sn) {
    return request({ url: `/api/inventory/scan/${encodeURIComponent(sn)}` });
  },
  batchImport(items) {
    return request({ url: '/api/inventory/batch-import', method: 'POST', data: { items } });
  },
};

// ── 备件类型模块 ──────────────────────────────────────
const partTypes = {
  list(query = {}) {
    return request({ url: `/api/part-types${toQueryString(query)}` });
  },
  create(data) {
    return request({ url: '/api/part-types', method: 'POST', data });
  },
  update(partNo, data) {
    return request({ url: `/api/part-types/${encodeURIComponent(partNo)}`, method: 'PATCH', data });
  },
  remove(partNo) {
    return request({ url: `/api/part-types/${encodeURIComponent(partNo)}`, method: 'DELETE' });
  },
};

// ── 申请模块 ──────────────────────────────────────────
const requests = {
  create(data) {
    return request({ url: '/api/requests', method: 'POST', data });
  },
  list(query = {}) {
    return request({ url: `/api/requests${toQueryString(query)}` });
  },
  detail(id) {
    return request({ url: `/api/requests/${id}` });
  },
  approve(id, partialItems) {
    const data = partialItems ? { partial_items: partialItems } : {};
    return request({ url: `/api/requests/${id}/approve`, method: 'POST', data });
  },
  reject(id, reason) {
    return request({ url: `/api/requests/${id}/reject`, method: 'POST', data: { reason } });
  },
  cancel(id) {
    return request({ url: `/api/requests/${id}/cancel`, method: 'POST' });
  },
};

// ── 分析模块 ──────────────────────────────────────────
const analytics = {
  kpi() {
    return requestSilent({ url: '/api/analytics/kpi' });
  },
  distribution() {
    return requestSilent({ url: '/api/analytics/distribution' });
  },
  safetyStock() {
    return requestSilent({ url: '/api/analytics/safety-stock' });
  },
  trend() {
    return requestSilent({ url: '/api/analytics/trend' });
  },
  consumption(months = 6) {
    return requestSilent({ url: `/api/analytics/consumption?months=${months}` });
  },
  age(staleDays = 90) {
    return requestSilent({ url: `/api/analytics/age?stale_days=${staleDays}` });
  },
  turnover(months = 6) {
    return requestSilent({ url: `/api/analytics/turnover?months=${months}` });
  },
};

// ── 日志模块 ──────────────────────────────────────────
const logs = {
  list(query = {}) {
    return request({ url: `/api/logs${toQueryString(query)}` });
  },
};

module.exports = {
  auth,
  inventory,
  partTypes,
  requests,
  analytics,
  logs,
  // 导出工具方法供外部使用
  setToken,
  clearToken,
  getToken,
  BASE_URL,
};
