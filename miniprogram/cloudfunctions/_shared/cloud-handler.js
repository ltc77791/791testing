/**
 * 云函数通用处理器 — 将微信云函数 event 转换为 Express 风格 req/res
 *
 * 设计目标：
 *   让 server/src/handlers/ 下的业务逻辑在云函数中直接复用，零修改
 *
 * 用法 (在云函数 index.js 中):
 *   const { handleRequest } = require('../_shared/cloud-handler');
 *   const inventoryHandlers = require('../../server/src/handlers/inventory');
 *
 *   exports.main = async (event, context) => {
 *     return handleRequest(event, context, {
 *       'GET /':           inventoryHandlers.listInventory,
 *       'POST /inbound':   inventoryHandlers.inbound,
 *       'GET /scan/:sn':   inventoryHandlers.scanBySN,
 *     });
 *   };
 *
 * event 结构约定:
 *   {
 *     action: 'GET /inbound',          // HTTP 方法 + 路径
 *     body: { ... },                   // 等价于 req.body
 *     query: { page: 1, pageSize: 20 },// 等价于 req.query
 *     params: { id: '...' },           // 等价于 req.params
 *     // 以下由云函数运行时自动注入
 *     userInfo: { openId: '...', appId: '...' }
 *   }
 */

// 设置云模式环境变量，在 require db-adapter 之前
process.env.DB_MODE = 'cloud';

const { connectDB } = require('../../server/src/db-adapter');

let _dbReady = false;

/**
 * 核心入口：路由分发 + req/res 模拟
 */
async function handleRequest(event, context, routeMap) {
  // 确保数据库已初始化
  if (!_dbReady) {
    await connectDB(event._env || undefined);
    _dbReady = true;
  }

  const action = event.action || '';
  if (!action) {
    return { code: 1, message: '缺少 action 参数' };
  }

  // 路由匹配（支持路径参数如 :id, :sn）
  const { handler, params: routeParams } = matchRoute(action, routeMap);
  if (!handler) {
    return { code: 1, message: `未知的操作: ${action}` };
  }

  // 构建 Express 风格的 req 对象
  const req = buildReq(event, routeParams);

  // 认证：将 openId 解析为系统用户
  const authResult = await resolveUser(event, req);
  if (authResult) return authResult; // 返回错误响应

  // 构建 Express 风格的 res 对象
  const { res, getResult } = buildRes();

  // 调用 handler
  try {
    await handler(req, res);
  } catch (err) {
    console.error('[cloud-handler] Handler error:', err);
    return { code: 1, message: '服务器内部错误' };
  }

  return getResult();
}

/**
 * 路由匹配 — 支持 'GET /scan/:sn' 风格的路径参数
 */
function matchRoute(action, routeMap) {
  // 精确匹配
  if (routeMap[action]) {
    return { handler: routeMap[action], params: {} };
  }

  // 参数化路由匹配
  const [method, actionPath] = action.split(' ');
  if (!actionPath) return { handler: null, params: {} };

  for (const [pattern, handler] of Object.entries(routeMap)) {
    const [pMethod, pPath] = pattern.split(' ');
    if (pMethod !== method) continue;

    const params = matchPath(actionPath, pPath);
    if (params !== null) {
      return { handler, params };
    }
  }

  return { handler: null, params: {} };
}

/**
 * 路径匹配: '/scan/SN001' vs '/scan/:sn' → { sn: 'SN001' }
 */
function matchPath(actual, pattern) {
  const aParts = actual.split('/').filter(Boolean);
  const pParts = pattern.split('/').filter(Boolean);

  if (aParts.length !== pParts.length) return null;

  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) {
      params[pParts[i].slice(1)] = decodeURIComponent(aParts[i]);
    } else if (pParts[i] !== aParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * 构建 Express 风格的 req 对象
 */
function buildReq(event, routeParams) {
  return {
    body: event.body || {},
    query: event.query || {},
    params: { ...(event.params || {}), ...routeParams },
    user: null, // 将在 resolveUser 中填充
    cookies: {},
    headers: {},
    method: (event.action || '').split(' ')[0] || 'GET',
    path: (event.action || '').split(' ')[1] || '/',
  };
}

/**
 * 微信 openId → 系统用户
 * 从 users 集合查找绑定了该 openId 的用户，填充 req.user
 */
async function resolveUser(event, req) {
  const openId = event.userInfo?.openId;
  if (!openId) {
    return { code: 1, message: '未获取到微信身份信息' };
  }

  const { getDB } = require('../../server/src/db-adapter');
  const db = getDB();

  const user = await db.collection('users').findOne({ openid: openId });
  if (!user) {
    return { code: 1, message: '用户未绑定，请先完成微信登录绑定' };
  }

  if (!user.is_active) {
    return { code: 1, message: '账户已禁用' };
  }

  // 模拟 JWT 解码后的 req.user 结构
  req.user = {
    username: user.username,
    roles: user.roles,
    openid: openId,
  };

  return null; // 认证成功
}

/**
 * 构建 Express 风格的 res 对象
 * 收集 handler 调用 res.json() / res.status().json() 的结果
 */
function buildRes() {
  let _statusCode = 200;
  let _result = null;
  let _headers = {};

  const res = {
    status(code) {
      _statusCode = code;
      return res; // 链式
    },

    json(data) {
      _result = data;
      return res;
    },

    send(data) {
      _result = data;
      return res;
    },

    set(key, val) {
      _headers[key] = val;
      return res;
    },

    setHeader(key, val) {
      _headers[key] = val;
      return res;
    },

    // cookie 在云函数中无意义，但需要存在以避免报错
    cookie() { return res; },
    clearCookie() { return res; },
  };

  function getResult() {
    // 如果 handler 未调用 json/send
    if (_result === null) {
      return { code: 1, message: '无响应' };
    }

    // handler 返回的结构已经是 { code, message, data } 格式
    // 直接透传，附加 HTTP 状态码供前端参考
    if (typeof _result === 'object') {
      return { ...(_result), _statusCode };
    }

    return { data: _result, _statusCode };
  }

  return { res, getResult };
}

/**
 * RBAC 检查工具 — 云函数版
 * 可在路由配置中使用，替代 Express 的 requireRole 中间件
 */
function requireRoles(...allowedRoles) {
  return function checkRole(req) {
    const userRoles = req.user?.roles || [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return {
        code: 1,
        message: `权限不足，需要角色: ${allowedRoles.join(' 或 ')}`,
        _statusCode: 403,
      };
    }
    return null; // 通过
  };
}

module.exports = {
  handleRequest,
  matchRoute,
  buildReq,
  buildRes,
  resolveUser,
  requireRoles,
};
