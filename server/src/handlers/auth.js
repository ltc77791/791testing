const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const config = require('../config');
const { getDB } = require('../db');

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
 * Returns: { code: 0, data: { token, user: { username, roles } } }
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    const db = getDB();
    const user = await db.collection('users').findOne({ username });

    if (!user || !user.is_active) {
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    // Update last_login
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    // Generate JWT (include token_version for revocation support)
    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    // Set JWT in HttpOnly Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      code: 0,
      data: {
        user: { username: user.username, roles: user.roles },
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

    const hash = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { password: hash }, $inc: { token_version: 1 } }
    );

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
  res.clearCookie('token');
  res.json({ code: 0, message: '登出成功' });
}

/**
 * POST /api/auth/wx-login
 * Body: { code }  (wx.login 获取的临时 code)
 * 返回: 已绑定 → JWT + 用户信息；未绑定 → needBind 标记
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
      // Generate a temporary bind token instead of exposing openId
      const bindToken = crypto.randomBytes(32).toString('hex');
      await db.collection('bind_tokens').insertOne({
        token: bindToken,
        openId,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes TTL
      });
      return res.json({ code: 0, data: { needBind: true, bindToken } });
    }

    // 更新登录时间
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    // 签发 JWT (include token_version)
    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    res.json({
      code: 0,
      data: {
        needBind: false,
        token,
        user: { username: user.username, roles: user.roles },
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
 * 验证账号密码后绑定 openId，返回 JWT
 */
async function wxBind(req, res) {
  try {
    const { bindToken, username, password } = req.body;
    if (!bindToken || !username || !password) {
      return res.status(400).json({ code: 1, message: 'bindToken、用户名和密码不能为空' });
    }

    const db = getDB();

    // Resolve bindToken to openId
    const tokenDoc = await db.collection('bind_tokens').findOneAndDelete({
      token: bindToken,
      expires_at: { $gt: new Date() },
    });
    if (!tokenDoc) {
      return res.status(400).json({ code: 1, message: '绑定令牌无效或已过期，请重新扫码' });
    }

    const openId = tokenDoc.openId;

    // 查找用户
    const user = await db.collection('users').findOne({ username });
    if (!user || !user.is_active) {
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ code: 1, message: '用户名或密码错误' });
    }

    // 检查该 openId 是否已绑定其他账号
    const existBind = await db.collection('users').findOne({ openid: openId });
    if (existBind && existBind.username !== username) {
      return res.status(409).json({
        code: 1,
        message: `此微信已绑定账号「${existBind.username}」，请先解绑`,
      });
    }

    // 绑定 openId
    await db.collection('users').updateOne(
      { username },
      { $set: { openid: openId, last_login: new Date() } }
    );

    // 记录日志
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '微信绑定',
      operator: username,
      details: `用户 ${username} 绑定微信 openId`,
      created_at: new Date(),
    });

    // 签发 JWT (include token_version)
    const payload = { username: user.username, roles: user.roles, tv: user.token_version || 1 };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    res.json({
      code: 0,
      message: '绑定成功',
      data: {
        token,
        user: { username: user.username, roles: user.roles },
      },
    });
  } catch (err) {
    console.error('wx-bind error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/auth/wx-unbind
 * Body: { username? }  (不传则解绑自己)
 * 需要认证：admin 可解绑他人，普通用户只能解绑自己
 */
async function wxUnbind(req, res) {
  try {
    const db = getDB();
    const targetUsername = req.body.username || req.user.username;

    // 只允许解绑自己，或 admin 解绑他人
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
 * Returns current authenticated user info (for session verification).
 */
async function me(req, res) {
  res.json({
    code: 0,
    data: { username: req.user.username, roles: req.user.roles },
  });
}

module.exports = { login, changePassword, logout, wxLogin, wxBind, wxUnbind, me };
