/**
 * 订阅消息发送模块 — Express 版
 * 使用微信 access_token + HTTPS API 发送订阅消息
 * 替代云函数中的 cloud.openapi.subscribeMessage.send
 */

const https = require('https');
const config = require('../config');
const { getDB } = require('../db');

// 模板 ID 从配置读取
const TEMPLATE_IDS = {
  STOCK_ALERT: config.wxTemplateIds.stockAlert,
  APPROVAL_RESULT: config.wxTemplateIds.approvalResult,
  REQUEST_SUBMIT: config.wxTemplateIds.requestSubmit,
};

// access_token 缓存
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * 获取微信 access_token（自动缓存，提前 5 分钟刷新）
 */
async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.wxAppId}&secret=${config.wxAppSecret}`;

  const data = await httpsGet(url);
  if (data.errcode) {
    console.error('[subscribe-message] 获取 access_token 失败:', data);
    throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  }

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000, // 提前 5 分钟过期
  };

  return _tokenCache.token;
}

/**
 * HTTPS GET 请求
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * HTTPS POST 请求
 */
function httpsPost(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * 发送订阅消息（单个用户）
 * 失败时静默忽略，不阻塞业务流程
 */
async function sendSubscribeMessage({ toUser, templateId, data, page }) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;

    const result = await httpsPost(url, {
      touser: toUser,
      template_id: templateId,
      data,
      page: page || '',
      miniprogram_state: config.nodeEnv === 'production' ? 'formal' : 'developer',
    });

    if (result.errcode && result.errcode !== 0) {
      console.warn('[subscribe-message] 发送失败:', result.errcode, result.errmsg, 'toUser:', toUser);
      return false;
    }

    console.log('[subscribe-message] 发送成功 toUser:', toUser);
    return true;
  } catch (err) {
    console.warn('[subscribe-message] 发送异常:', err.message, 'toUser:', toUser);
    return false;
  }
}

/**
 * 批量发送订阅消息（多个用户，同一模板）
 */
async function sendToMultipleUsers({ toUsers, templateId, data, page }) {
  let successCount = 0;
  for (const openId of toUsers) {
    const ok = await sendSubscribeMessage({ toUser: openId, templateId, data, page });
    if (ok) successCount++;
  }
  return successCount;
}

/**
 * 查询所有 manager/admin 的 openId
 */
async function getManagerOpenIds() {
  const db = getDB();
  const users = await db.collection('users')
    .find({ is_active: true })
    .toArray();

  return users
    .filter(u => u.openid && (u.roles || []).some(r => r === 'admin' || r === 'manager'))
    .map(u => u.openid);
}

// 工具函数
function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function _formatTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 通知场景：申请提交 → 通知所有 manager/admin
 */
async function notifyRequestSubmitted({ applicant, items, projectLocation }) {
  const openIds = await getManagerOpenIds();
  if (openIds.length === 0) return;

  const itemsSummary = items.map(i => `${i.part_name || i.part_no}×${i.quantity}`).join(', ');

  await sendToMultipleUsers({
    toUsers: openIds,
    templateId: TEMPLATE_IDS.REQUEST_SUBMIT,
    data: {
      thing2: { value: _truncate(applicant, 20) },
      thing3: { value: _truncate(itemsSummary, 20) },
      time1: { value: _formatTime(new Date()) },
      thing4: { value: _truncate(projectLocation || '未填写', 20) },
    },
    page: 'pages/approval/approval',
  });
}

/**
 * 通知场景：审批结果 → 通知申请人
 */
async function notifyApprovalResult({ applicantUsername, result, items, reason }) {
  const db = getDB();
  const user = await db.collection('users').findOne({ username: applicantUsername });
  if (!user || !user.openid) return;

  const itemsSummary = items.map(i => `${i.part_name || i.part_no}×${i.quantity}`).join(', ');

  await sendSubscribeMessage({
    toUser: user.openid,
    templateId: TEMPLATE_IDS.APPROVAL_RESULT,
    data: {
      thing1: { value: _truncate(itemsSummary, 20) },
      phrase2: { value: result === 'approved' ? '已通过' : '已驳回' },
      time9: { value: _formatTime(new Date()) },
      thing3: { value: _truncate(reason || '无', 20) },
    },
    page: 'pages/request/request',
  });
}

/**
 * 通知场景：安全库存预警 → 通知所有 manager/admin（24h 防重复）
 */
async function notifyStockAlert({ partNo, partName, currentStock, minStock }) {
  const db = getDB();

  // 防重复：检查 24 小时内是否已发送过同一备件的预警
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAlert = await db.collection('sys_logs').findOne({
    category: 'Notification',
    action_type: '库存预警通知',
    details: { $regex: `part_no=${partNo}` },
    created_at: { $gte: since },
  });
  if (recentAlert) return;

  const openIds = await getManagerOpenIds();
  if (openIds.length === 0) return;

  await sendToMultipleUsers({
    toUsers: openIds,
    templateId: TEMPLATE_IDS.STOCK_ALERT,
    data: {
      thing1: { value: _truncate(`${partName || partNo}`, 20) },
      short_thing3: { value: `${currentStock}` },
      short_thing4: { value: `${minStock}` },
      thing5: { value: `当前库存不足，缺口${minStock - currentStock}` },
    },
    page: 'pages/inventory/inventory',
  });

  // 记录预警发送日志
  await db.collection('sys_logs').insertOne({
    category: 'Notification',
    action_type: '库存预警通知',
    operator: 'system',
    details: `库存预警: part_no=${partNo}, 当前${currentStock}, 安全线${minStock}`,
    created_at: new Date(),
  });
}

/**
 * 检查并触发库存预警（在出库/入库操作后调用）
 */
async function checkAndNotifyStockAlert(partNos) {
  if (!partNos || partNos.length === 0) return;

  const db = getDB();
  const uniquePartNos = [...new Set(partNos)];

  for (const partNo of uniquePartNos) {
    const partType = await db.collection('part_types').findOne({ part_no: partNo });
    if (!partType || !partType.min_stock) continue;

    if (partType.current_stock < partType.min_stock) {
      await notifyStockAlert({
        partNo,
        partName: partType.part_name,
        currentStock: partType.current_stock,
        minStock: partType.min_stock,
      });
    }
  }
}

module.exports = {
  TEMPLATE_IDS,
  getAccessToken,
  sendSubscribeMessage,
  sendToMultipleUsers,
  getManagerOpenIds,
  notifyRequestSubmitted,
  notifyApprovalResult,
  notifyStockAlert,
  checkAndNotifyStockAlert,
};
