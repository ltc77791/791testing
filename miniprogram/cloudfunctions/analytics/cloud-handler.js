/**
 * 云函数通用处理器 — 将微信云函数 event 转换为 Express 风格 req/res
 */

const { connectDB, getDB } = require('./db-adapter');

let _dbReady = false;

async function handleRequest(event, context, routeMap) {
  if (!_dbReady) {
    await connectDB(event._env || undefined);
    _dbReady = true;
  }

  const action = event.action || '';
  if (!action) {
    return { code: 1, message: '缺少 action 参数' };
  }

  const { handler, params: routeParams } = matchRoute(action, routeMap);
  if (!handler) {
    return { code: 1, message: `未知的操作: ${action}` };
  }

  const req = buildReq(event, routeParams);
  const authResult = await resolveUser(event, req);
  if (authResult) return authResult;

  const { res, getResult } = buildRes();

  try {
    await handler(req, res);
  } catch (err) {
    console.error('[cloud-handler] Handler error:', err);
    return { code: 1, message: '服务器内部错误' };
  }

  return getResult();
}

function matchRoute(action, routeMap) {
  if (routeMap[action]) {
    return { handler: routeMap[action], params: {} };
  }

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

function buildReq(event, routeParams) {
  return {
    body: event.body || {},
    query: event.query || {},
    params: { ...(event.params || {}), ...routeParams },
    user: null,
    cookies: {},
    headers: {},
    method: (event.action || '').split(' ')[0] || 'GET',
    path: (event.action || '').split(' ')[1] || '/',
  };
}

async function resolveUser(event, req) {
  const openId = event.userInfo?.openId;
  if (!openId) {
    return { code: 1, message: '未获取到微信身份信息' };
  }

  const db = getDB();
  const user = await db.collection('users').findOne({ openid: openId });
  if (!user) {
    return { code: 1, message: '用户未绑定，请先完成微信登录绑定' };
  }
  if (!user.is_active) {
    return { code: 1, message: '账户已禁用' };
  }

  req.user = {
    username: user.username,
    roles: user.roles,
    openid: openId,
  };

  return null;
}

function buildRes() {
  let _statusCode = 200;
  let _result = null;

  const res = {
    status(code) { _statusCode = code; return res; },
    json(data) { _result = data; return res; },
    send(data) { _result = data; return res; },
    set() { return res; },
    setHeader() { return res; },
    cookie() { return res; },
    clearCookie() { return res; },
  };

  function getResult() {
    if (_result === null) {
      return { code: 1, message: '无响应' };
    }
    if (typeof _result === 'object') {
      return { ..._result, _statusCode };
    }
    return { data: _result, _statusCode };
  }

  return { res, getResult };
}

module.exports = { handleRequest };
