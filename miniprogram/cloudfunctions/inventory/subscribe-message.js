/**
 * 订阅消息通用发送模块
 * 封装 wx-server-sdk 的 subscribeMessage.send，提供统一的错误处理和日志记录
 */

const cloud = require('wx-server-sdk');

// 模板 ID 配置
const TEMPLATE_IDS = {
  // 库存预警通知 (预约记录提醒模板)
  STOCK_ALERT: 'vopU72-_cp3VgTejH4OvJwvTPdmZw0U07oqnrwFPf_Q',
  // 备件申请审批结果 (审核结果通知模板)
  APPROVAL_RESULT: 'giSmlLFMc32RwQY2xCAo4Lnf4ZzurdzcXMMkhr-rIBQ',
  // 备件申请通知 (请柬提醒模板)
  REQUEST_SUBMIT: '9fsxaUqwRByLo6Ed6RQlkMOENU_FWunc9766WN1eB2E',
};

/**
 * 发送订阅消息（单个用户）
 * 失败时静默忽略，不阻塞业务流程
 *
 * @param {object} opts
 * @param {string} opts.toUser - 接收者的 openId
 * @param {string} opts.templateId - 模板 ID
 * @param {object} opts.data - 模板数据 { key: { value: '...' } }
 * @param {string} [opts.page] - 点击通知跳转的页面路径
 * @param {object} [opts.db] - 数据库实例（用于记录日志），可选
 * @returns {boolean} 是否发送成功
 */
async function sendSubscribeMessage({ toUser, templateId, data, page, db }) {
  console.log('[subscribe-message] 准备发送:', JSON.stringify({ toUser, templateId, data, page }));
  try {
    const sendResult = await cloud.openapi.subscribeMessage.send({
      touser: toUser,
      templateId,
      data,
      page: page || '',
      // 开发调试用 'developer'，体验版用 'trial'，正式版用 'formal'
      miniprogramState: 'developer',
    });
    console.log('[subscribe-message] 发送结果:', JSON.stringify(sendResult));

    // 记录发送成功日志
    if (db) {
      await db.collection('sys_logs').insertOne({
        category: 'Notification',
        action_type: '订阅消息发送',
        operator: 'system',
        details: `发送订阅消息成功: templateId=${templateId}, toUser=${toUser}`,
        created_at: new Date(),
      });
    }
    return true;
  } catch (err) {
    // 常见错误：用户拒绝授权 (43101)、达到发送上限等，均静默忽略
    console.warn('[subscribe-message] 发送失败:', err.errCode || err.message, 'toUser:', toUser);
    return false;
  }
}

/**
 * 批量发送订阅消息（多个用户，同一模板）
 * 逐个发送，失败不影响其他用户
 *
 * @param {object} opts
 * @param {string[]} opts.toUsers - 接收者 openId 列表
 * @param {string} opts.templateId - 模板 ID
 * @param {object} opts.data - 模板数据
 * @param {string} [opts.page] - 跳转页面
 * @param {object} [opts.db] - 数据库实例
 * @returns {number} 成功发送数量
 */
async function sendToMultipleUsers({ toUsers, templateId, data, page, db }) {
  let successCount = 0;
  for (const openId of toUsers) {
    const ok = await sendSubscribeMessage({ toUser: openId, templateId, data, page, db });
    if (ok) successCount++;
  }
  return successCount;
}

/**
 * 查询所有 manager/admin 的 openId
 * @param {object} db - 数据库实例
 * @returns {string[]} openId 列表
 */
async function getManagerOpenIds(db) {
  // 查询 roles 包含 admin 或 manager 且有 openid 的用户
  const users = await db.collection('users')
    .find({ is_active: true })
    .toArray();

  console.log('[subscribe-message] 查询到用户数:', users.length,
    '用户列表:', users.map(u => ({ username: u.username, roles: u.roles, openid: u.openid ? '有' : '无' })));

  const result = users
    .filter(u => u.openid && (u.roles || []).some(r => r === 'admin' || r === 'manager'))
    .map(u => u.openid);

  console.log('[subscribe-message] 符合条件的 manager/admin openId 数量:', result.length);
  return result;
}

/**
 * 通知场景：申请提交 → 通知所有 manager/admin
 */
async function notifyRequestSubmitted({ db, applicant, items, projectLocation }) {
  const openIds = await getManagerOpenIds(db);
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
    db,
  });
}

/**
 * 通知场景：审批结果 → 通知申请人
 */
async function notifyApprovalResult({ db, applicantUsername, result, items, reason }) {
  // 查询申请人的 openId
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
    db,
  });
}

/**
 * 通知场景：安全库存预警 → 通知所有 manager/admin
 * 同一备件 24 小时内只发一次
 */
async function notifyStockAlert({ db, partNo, partName, currentStock, minStock }) {
  // 防重复：检查 24 小时内是否已发送过同一备件的预警
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAlert = await db.collection('sys_logs').findOne({
    category: 'Notification',
    action_type: '库存预警通知',
    details: { $regex: `part_no=${partNo}` },
    created_at: { $gte: since },
  });
  if (recentAlert) return;

  const openIds = await getManagerOpenIds(db);
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
    db,
  });

  // 记录预警发送日志（用于防重复判断）
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
 * @param {object} db - 数据库实例
 * @param {string[]} partNos - 需要检查的备件型号列表
 */
async function checkAndNotifyStockAlert(db, partNos) {
  if (!partNos || partNos.length === 0) return;

  const uniquePartNos = [...new Set(partNos)];
  for (const partNo of uniquePartNos) {
    const partType = await db.collection('part_types').findOne({ part_no: partNo });
    if (!partType || !partType.min_stock) continue;

    if (partType.current_stock < partType.min_stock) {
      await notifyStockAlert({
        db,
        partNo,
        partName: partType.part_name,
        currentStock: partType.current_stock,
        minStock: partType.min_stock,
      });
    }
  }
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

module.exports = {
  TEMPLATE_IDS,
  sendSubscribeMessage,
  sendToMultipleUsers,
  getManagerOpenIds,
  notifyRequestSubmitted,
  notifyApprovalResult,
  notifyStockAlert,
  checkAndNotifyStockAlert,
};
