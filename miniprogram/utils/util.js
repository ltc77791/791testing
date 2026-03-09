/**
 * 通用工具函数
 */

/**
 * 格式化日期时间
 */
function formatTime(date) {
  if (!date) return '-';
  if (typeof date === 'string') date = new Date(date);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 格式化日期（不含时间）
 */
function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') date = new Date(date);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 申请状态文本映射
 */
function statusText(status) {
  const map = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已撤回',
  };
  return map[status] || status;
}

/**
 * 库存状态文本
 */
function inventoryStatusText(status) {
  return status === 0 ? '在库' : '已出库';
}

/**
 * 防抖
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

module.exports = {
  formatTime,
  formatDate,
  statusText,
  inventoryStatusText,
  debounce,
};
