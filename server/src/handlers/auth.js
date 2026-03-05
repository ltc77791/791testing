const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDB } = require('../db');

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

    // Generate JWT
    const payload = { username: user.username, roles: user.roles };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    res.json({
      code: 0,
      data: {
        token,
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
      { $set: { password: hash } }
    );

    res.json({ code: 0, message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { login, changePassword };
