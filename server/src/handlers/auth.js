const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const config = require('../config');
const { getDB } = require('../db');

// ★ Feature #2: Default password constant
const DEFAULT_PASSWORD = '123456';

/**
 * ★ Feature #8: Write audit log entry for authentication events
 */
async function auditLog(db, { action, username, success, ip, userAgent, details }) {
  try {
    await db.collection('sys_logs').insertOne({
      category: 'Auth',
      action_type: action,
      operator: username || '(unknown)',
      details: details || `${action}: ${success ? '成功' : '失败'}`,
      ip: ip || '',
      user_agent: userAgent || '',
      created_at: new Date(),
    });
  } catch (err) {
    console.warn('Audit log write failed:', err.message);
  }
}

/**
 * Helper: parse JWT expiry string to milliseconds for cookie maxAge
 */
function parseExpiryToMs(expiresIn) {
  const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 12 * 60 * 60 * 1000; // fallback 12h
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return num * (multipliers[unit] || 3600000);
}

/**
 * 调用微信 jscode2session 接口，用 code 换 openId + session_key
 */
function code2Session(code) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}&secret=${config.wxAppSecret}&js_code=${code}&grant_type=authorization_code`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res) {
  try {
    let { username, password } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';

    // ★ Feature #1: Normalize username to lowercase
    username = username.toLowerCase().trim();

    const db = getDB();
    const user = await db.collection('users').findOne({ username });

    if (!user) {
      await auditLog(db, { action: '登录失败', username, success: false, ip, userAgent, details: `登录失败: 用户不存在` });
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    // ★ Feature #7: Check account lockout
    if (user.locked_until && user.locked_until > new Date()) {
      const remainMin = Math.ceil((user.locked_until - new Date()) / 60000);
      await auditLog(db, { action: '登录失败', username, success: false, ip, userAgent, details: `登录失败: 账户已锁定，剩余 ${remainMin} 分钟` });
      return res.status(423).json({ code: 1, message: `账户已锁定，请 ${remainMin} 分钟后重试` });
    }

    if (!user.is_active) {
      await auditLog(db, { action: '登录失败', username, success: false, ip, userAgent, details: `登录失败: 账户已停用` });
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      // ★ Feature #7: Increment failed attempts
      const attempts = (user.failed_login_attempts || 0) + 1;
      const updateFields = { failed_login_attempts: attempts };
      if (attempts >= config.maxLoginAttempts) {
        updateFields.locked_until = new Date(Date.now() + config.lockoutMinutes * 60 * 1000);
      }
      await db.collection('users').updateOne({ _id: user._id }, { $set: updateFields });

      const remaining = config.maxLoginAttempts - attempts;
      const detail = remaining > 0
        ? `登录失败: 密码错误，剩余 ${remaining} 次机会`
        : `登录失败: 密码错误，账户已锁定 ${config.lockoutMinutes} 分钟`;
      await auditLog(db, { action: '登录失败', username, success: false, ip, userAgent, details: detail });

      if (remaining > 0) {
        return res.status(401).json({ code: 1, message: `用户名或密码错误，还剩 ${remaining} 次尝试机会` });
      } else {
        return res.status(423).json({ code: 1, message: `密码错误次数过多，账户已锁定 ${config.lockoutMinutes} 分钟` });
      }
    }

    // ★ Feature #7: Reset failed attempts on successful login
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date(), failed_login_attempts: 0, locked_until: null } }
    );

    // Generate JWT (include token_version for revocation support)
    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    // ★ Feature #6: Set cookie maxAge to match JWT expiry
    const cookieMaxAge = parseExpiryToMs(config.jwtExpiresIn);
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: cookieMaxAge,
    });

    // ★ Feature #8: Audit log
    await auditLog(db, { action: '登录成功', username, success: true, ip, userAgent, details: `PC端登录成功` });

    // ★ Feature #2: Include must_change_password in response
    res.json({
      code: 0,
      data: {
        user: { username: user.username, roles: user.roles },
        must_change_password: !!user.must_change_password,
        softTimeoutMinutes: config.softTimeoutMinutes,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/auth/change-password
 * Body: { oldPassword, newPassword }
 * Requires: authenticate middleware
 */
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;

    const db = getDB();
    const user = await db.collection('users').findOne({ username: req.user.username });

    if (!user) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(400).json({ code: 1, message: '旧密码错误' });
    }

    // ★ Feature #4: Password complexity check (skip if setting to default password, which shouldn't happen here)
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!complexityRegex.test(newPassword)) {
      return res.status(400).json({ code: 1, message: '新密码必须至少8位，包含大写字母、小写字母和数字' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { password: hash, must_change_password: false }, $inc: { token_version: 1 } }
    );

    // ★ Feature #8: Audit log
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';
    await auditLog(db, { action: '修改密码', username: req.user.username, success: true, ip, userAgent, details: `用户 ${req.user.username} 修改密码` });

    res.json({ code: 0, message: '密码修改成功，请重新登录' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/auth/logout
 * Clears the HttpOnly cookie
 */
async function logout(req, res) {
  // ★ Feature #8: Audit log (best-effort, user may not be authenticated)
  try {
    const db = getDB();
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';
    // Try to get username from cookie token
    let username = '(unknown)';
    try {
      const token = req.cookies?.token;
      if (token) {
        const decoded = jwt.verify(token, config.jwtSecret, { ignoreExpiration: true });
        username = decoded.username || '(unknown)';
      }
    } catch { /* ignore */ }
    await auditLog(db, { action: '登出', username, success: true, ip, userAgent, details: `用户 ${username} 登出` });
  } catch { /* ignore */ }

  res.clearCookie('token');
  res.json({ code: 0, message: '登出成功' });
}

/**
 * POST /api/auth/wx-login
 * Body: { code }  (wx.login 获取的临时 code)
 */
async function wxLogin(req, res) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ code: 1, message: 'code 不能为空' });
    }

    const wxRes = await code2Session(code);
    if (wxRes.errcode) {
      console.error('wx code2session error:', wxRes);
      return res.status(400).json({ code: 1, message: `微信登录失败: ${wxRes.errmsg}` });
    }

    const openId = wxRes.openid;
    const db = getDB();

    const user = await db.collection('users').findOne({ openid: openId, is_active: true });

    if (!user) {
      const bindToken = crypto.randomBytes(32).toString('hex');
      await db.collection('bind_tokens').insertOne({
        token: bindToken,
        openId,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });
      return res.json({ code: 0, data: { needBind: true, bindToken } });
    }

    // ★ Feature #7: Check account lockout for wx login
    if (user.locked_until && user.locked_until > new Date()) {
      return res.status(423).json({ code: 1, message: '账户已锁定，请稍后重试' });
    }

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    // ★ Feature #8: Audit log
    await auditLog(db, { action: '微信登录', username: user.username, success: true, ip: req.ip, userAgent: req.headers['user-agent'], details: `微信小程序静默登录成功` });

    res.json({
      code: 0,
      data: {
        needBind: false,
        token,
        user: { username: user.username, roles: user.roles },
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error('wx-login error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/auth/wx-bind
 * Body: { bindToken, username, password }
 */
async function wxBind(req, res) {
  try {
    let { bindToken, username, password } = req.body;
    if (!bindToken || !username || !password) {
      return res.status(400).json({ code: 1, message: 'bindToken、用户名和密码不能为空' });
    }

    // ★ Feature #1: Normalize username
    username = username.toLowerCase().trim();

    const db = getDB();

    const tokenDoc = await db.collection('bind_tokens').findOneAndDelete({
      token: bindToken,
      expires_at: { $gt: new Date() },
    });
    if (!tokenDoc) {
      return res.status(400).json({ code: 1, message: '绑定令牌无效或已过期，请重新扫码' });
    }

    const openId = tokenDoc.openId;

    const user = await db.collection('users').findOne({ username });
    if (!user || !user.is_active) {
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    // ★ Feature #7: Check lockout
    if (user.locked_until && user.locked_until > new Date()) {
      return res.status(423).json({ code: 1, message: '账户已锁定，请稍后重试' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      // ★ Feature #7: Increment failed attempts
      const attempts = (user.failed_login_attempts || 0) + 1;
      const updateFields = { failed_login_attempts: attempts };
      if (attempts >= config.maxLoginAttempts) {
        updateFields.locked_until = new Date(Date.now() + config.lockoutMinutes * 60 * 1000);
      }
      await db.collection('users').updateOne({ _id: user._id }, { $set: updateFields });
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    const existBind = await db.collection('users').findOne({ openid: openId });
    if (existBind && existBind.username !== username) {
      return res.status(409).json({
        code: 1,
        message: `此微信已绑定账号「${existBind.username}」，请先解绑`,
      });
    }

    // ★ Feature #7: Reset failed attempts
    await db.collection('users').updateOne(
      { username },
      { $set: { openid: openId, last_login: new Date(), failed_login_attempts: 0, locked_until: null } }
    );

    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '微信绑定',
      operator: username,
      details: `用户 ${username} 绑定微信 openId`,
      created_at: new Date(),
    });

    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    // ★ Feature #8: Audit log
    await auditLog(db, { action: '微信绑定登录', username, success: true, ip: req.ip, userAgent: req.headers['user-agent'], details: `微信绑定并登录成功` });

    res.json({
      code: 0,
      message: '绑定成功',
      data: {
        token,
        user: { username: user.username, roles: user.roles },
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error('wx-bind error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/auth/wx-unbind
 */
async function wxUnbind(req, res) {
  try {
    const db = getDB();
    const targetUsername = req.body.username || req.user.username;

    if (targetUsername !== req.user.username) {
      if (!req.user.roles.includes('admin')) {
        return res.status(403).json({ code: 1, message: '权限不足，只有管理员可以解绑他人' });
      }
    }

    await db.collection('users').updateOne(
      { username: targetUsername },
      { $unset: { openid: '' } }
    );

    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '微信解绑',
      operator: req.user.username,
      details: `解绑用户 ${targetUsername} 的微信`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '解绑成功' });
  } catch (err) {
    console.error('wx-unbind error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/auth/me
 * Returns current authenticated user info + soft timeout config
 */
async function me(req, res) {
  // Also check must_change_password from DB
  const db = getDB();
  const user = await db.collection('users').findOne(
    { username: req.user.username },
    { projection: { must_change_password: 1 } }
  );
  res.json({
    code: 0,
    data: {
      username: req.user.username,
      roles: req.user.roles,
      must_change_password: !!(user && user.must_change_password),
      softTimeoutMinutes: config.softTimeoutMinutes,
    },
  });
}

module.exports = { login, changePassword, logout, wxLogin, wxBind, wxUnbind, me, DEFAULT_PASSWORD };
