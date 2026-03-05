const bcrypt = require('bcryptjs');
const { getDB } = require('../db');

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
 * Body: { username, password, roles }
 * Requires: admin role.
 */
async function createUser(req, res) {
  try {
    const { username, password, roles } = req.body;
    const userRoles = roles;

    const db = getDB();

    // Check duplicate username
    const existing = await db.collection('users').findOne({ username });
    if (existing) {
      return res.status(409).json({ code: 1, message: '用户名已存在' });
    }

    const hash = await bcrypt.hash(password, 10);
    const doc = {
      username,
      password: hash,
      roles: userRoles,
      is_active: true,
      created_at: new Date(),
      last_login: null,
    };

    await db.collection('users').insertOne(doc);

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'UserMgmt',
      action_type: '新增用户',
      operator: req.user.username,
      details: `新增用户: ${username}, 角色: ${userRoles.join(',')}`,
      created_at: new Date(),
    });

    res.status(201).json({ code: 0, message: '用户创建成功' });
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
    }

    if (password !== undefined) {
      updateFields.password = await bcrypt.hash(password, 10);
      changes.push('重置密码');
    }

    await db.collection('users').updateOne(
      { username },
      { $set: updateFields }
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

module.exports = { listUsers, createUser, updateUser, deleteUser };
