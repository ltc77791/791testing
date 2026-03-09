/**
 * 云函数：auth — 微信登录 + 用户绑定
 *
 * 小程序认证流程（与 PC 端 JWT 完全独立）：
 *   1. 小程序调用 wx.login() 获取 code
 *   2. 调用本云函数 'POST /wx-login'，云函数自动获取 openId
 *   3. 查询 users 集合是否已绑定该 openId
 *     - 已绑定：返回用户信息
 *     - 未绑定：返回 needBind 标记
 *   4. 前端输入用户名密码调用 'POST /bind' 完成绑定
 *
 * 支持的 action:
 *   POST /wx-login   — 微信登录（获取 openId 并查找绑定用户）
 *   POST /bind       — 账号绑定（用户名+密码 → 绑定 openId）
 *   POST /unbind     — 解绑（管理员操作）
 */

process.env.DB_MODE = 'cloud';

const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');

let _inited = false;

function ensureInit(event) {
  if (_inited) return;
  cloud.init({ env: event._env || cloud.DYNAMIC_CURRENT_ENV });
  _inited = true;
}

exports.main = async (event, context) => {
  ensureInit(event);

  const action = event.action || '';
  const { OPENID } = cloud.getWXContext();

  switch (action) {
    case 'POST /wx-login':
      return wxLogin(OPENID);
    case 'POST /bind':
      return bindAccount(OPENID, event.body || {});
    case 'POST /unbind':
      return unbindAccount(OPENID, event.body || {});
    default:
      return { code: 1, message: `未知的操作: ${action}` };
  }
};

/**
 * 微信登录 — 通过 openId 查找已绑定用户
 */
async function wxLogin(openId) {
  if (!openId) {
    return { code: 1, message: '无法获取微信身份信息' };
  }

  const db = cloud.database();
  const { data } = await db.collection('users')
    .where({ openid: openId, is_active: true })
    .limit(1)
    .get();

  if (data.length === 0) {
    // 未绑定
    return {
      code: 0,
      data: { needBind: true, openId },
      message: '请绑定系统账号',
    };
  }

  const user = data[0];
  // 更新最后登录时间
  await db.collection('users')
    .where({ openid: openId })
    .update({ data: { last_login: new Date() } });

  return {
    code: 0,
    data: {
      needBind: false,
      user: {
        username: user.username,
        roles: user.roles,
      },
    },
  };
}

/**
 * 账号绑定 — 用户名+密码验证后将 openId 写入 users 记录
 */
async function bindAccount(openId, body) {
  if (!openId) {
    return { code: 1, message: '无法获取微信身份信息' };
  }

  const { username, password } = body;
  if (!username || !password) {
    return { code: 1, message: '用户名和密码不能为空', _statusCode: 400 };
  }

  const db = cloud.database();

  // 查找用户
  const { data } = await db.collection('users')
    .where({ username })
    .limit(1)
    .get();

  if (data.length === 0) {
    return { code: 1, message: '用户名或密码错误', _statusCode: 401 };
  }

  const user = data[0];

  if (!user.is_active) {
    return { code: 1, message: '账户已禁用', _statusCode: 403 };
  }

  // 校验密码
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return { code: 1, message: '用户名或密码错误', _statusCode: 401 };
  }

  // 检查该 openId 是否已绑定其他账号
  const { data: existBind } = await db.collection('users')
    .where({ openid: openId })
    .limit(1)
    .get();

  if (existBind.length > 0 && existBind[0].username !== username) {
    return {
      code: 1,
      message: `此微信已绑定账号「${existBind[0].username}」，请先解绑`,
      _statusCode: 409,
    };
  }

  // 绑定 openId
  await db.collection('users')
    .where({ username })
    .update({
      data: {
        openid: openId,
        last_login: new Date(),
      },
    });

  // 记录日志
  await db.collection('sys_logs').add({
    data: {
      category: 'UserMgmt',
      action_type: '微信绑定',
      operator: username,
      details: `用户 ${username} 绑定微信 openId`,
      created_at: new Date(),
    },
  });

  return {
    code: 0,
    message: '绑定成功',
    data: {
      user: {
        username: user.username,
        roles: user.roles,
      },
    },
  };
}

/**
 * 解绑微信 — 清除 openId（需要管理员权限或本人操作）
 */
async function unbindAccount(openId, body) {
  if (!openId) {
    return { code: 1, message: '无法获取微信身份信息' };
  }

  const db = cloud.database();

  // 获取当前操作者
  const { data: currentUsers } = await db.collection('users')
    .where({ openid: openId })
    .limit(1)
    .get();

  if (currentUsers.length === 0) {
    return { code: 1, message: '当前微信未绑定任何账号' };
  }

  const currentUser = currentUsers[0];
  const targetUsername = body.username || currentUser.username;

  // 只允许解绑自己，或 admin 角色解绑他人
  if (targetUsername !== currentUser.username) {
    if (!currentUser.roles.includes('admin')) {
      return { code: 1, message: '权限不足，只有管理员可以解绑他人', _statusCode: 403 };
    }
  }

  const _ = db.command;
  await db.collection('users')
    .where({ username: targetUsername })
    .update({ data: { openid: _.remove() } });

  await db.collection('sys_logs').add({
    data: {
      category: 'UserMgmt',
      action_type: '微信解绑',
      operator: currentUser.username,
      details: `解绑用户 ${targetUsername} 的微信`,
      created_at: new Date(),
    },
  });

  return { code: 0, message: '解绑成功' };
}
