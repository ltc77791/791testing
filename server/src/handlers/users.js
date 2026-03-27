const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { DEFAULT_PASSWORD } = require('./auth');

/**
 * GET /api/users
 * Returns all users (without password field).
 * Requires: admin role.
 */
async function listUsers(req, res) {
  try {
    const db = getDB();
    const users = await db.collection('users')
      .find({}, { projection: { password: 0 } })
      .sort({ created_at: -1 })
      .toArray();

    res.json({ code: 0, data: users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/users
 * Body: { username, roles }
 * ★ Feature #2: Password is always the default (123456), must_change_password = true
 * Requires: admin role.
 */
async function createUser(req, res) {
  try {
    let { username, roles } = req.body;
    const userRoles = roles;

    // ★ Feature #1: Normalize username to lowercase
    username = username.toLowerCase().trim();

    const db = getDB();

    // Check duplicate username
    const existing = await db.collection('users').findOne({ username });
    if (existing) {
      return res.status(409).json({ code: 1, message: '用户名已存在' });
    }

    // ★ Feature #2: Always use default password
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const doc = {
      username,
      password: hash,
      roles: userRoles,
      is_active: true,
      token_version: 2,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      last_login: null,
    };

    await db.collection('users').insertOne(doc);

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '新增用户',
      operator: req.user.username,
      details: `新增用户: ${username}, 角色: ${userRoles.join(',')}, 默认密码`,
      created_at: new Date(),
    });

    res.status(201).json({ code: 0, message: '用户创建成功，默认密码为 123456' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * PATCH /api/users/:username
 * Body: { roles?, is_active?, password? }
 * Requires: admin role.
 */
async function updateUser(req, res) {
  try {
    const { username } = req.params;
    const { roles, is_active, password } = req.body;

    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    const updateFields = {};
    const changes = [];

    if (roles !== undefined) {
      updateFields.roles = roles;
      changes.push(`角色: ${roles.join(',')}`);
    }

    if (is_active !== undefined) {
      updateFields.is_active = is_active;
      changes.push(is_active ? '启用' : '停用');
      // ★ Feature #7: Clear lockout when re-enabling
      if (is_active) {
        updateFields.failed_login_attempts = 0;
        updateFields.locked_until = null;
      }
    }

    if (password !== undefined) {
      updateFields.password = await bcrypt.hash(password, 10);
      changes.push('重置密码');
    }

    // Increment token_version to invalidate existing sessions when password or active status changes
    const needsRevocation = password !== undefined || (is_active !== undefined && !is_active);
    const updateOp = { $set: updateFields };
    if (needsRevocation) {
      updateOp.$inc = { token_version: 1 };
    }

    await db.collection('users').updateOne(
      { username },
      updateOp
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '编辑用户',
      operator: req.user.username,
      details: `编辑用户 ${username}: ${changes.join(', ')}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '用户更新成功' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/users/:username/reset-password
 * ★ Feature #3: Reset to default password (123456) + must_change_password
 * Requires: admin role.
 */
async function resetPassword(req, res) {
  try {
    const { username } = req.params;

    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await db.collection('users').updateOne(
      { username },
      {
        $set: {
          password: hash,
          must_change_password: true,
          failed_login_attempts: 0,
          locked_until: null,
        },
        $inc: { token_version: 1 },
      }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '重置密码',
      operator: req.user.username,
      details: `重置用户 ${username} 密码为默认密码`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: `密码已重置为默认密码 (${DEFAULT_PASSWORD})` });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/users/:username/unlock
 * ★ Feature #7: Admin unlock a locked account
 */
async function unlockUser(req, res) {
  try {
    const { username } = req.params;

    const db = getDB();
    const result = await db.collection('users').updateOne(
      { username },
      { $set: { failed_login_attempts: 0, locked_until: null } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '解锁用户',
      operator: req.user.username,
      details: `解锁用户 ${username}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '用户已解锁' });
  } catch (err) {
    console.error('Unlock user error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * DELETE /api/users/:username
 * Requires: admin role. Cannot delete self.
 */
async function deleteUser(req, res) {
  try {
    const { username } = req.params;

    if (username === req.user.username) {
      return res.status(400).json({ code: 1, message: '不能删除自己的账户' });
    }

    const db = getDB();
    const result = await db.collection('users').deleteOne({ username });

    if (result.deletedCount === 0) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '删除用户',
      operator: req.user.username,
      details: `删除用户: ${username}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '用户删除成功' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, unlockUser };
