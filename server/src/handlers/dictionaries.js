const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

const VALID_CATEGORIES = ['project_no', 'contract_no'];
const CATEGORY_LABELS = { project_no: '项目号', contract_no: '采购合同号' };

/**
 * GET /api/dictionaries
 * Query: ?category=project_no&keyword=xxx&is_active=true&page=1&pageSize=20
 */
async function listDictionaries(req, res) {
  try {
    const db = getDB();
    const { category, keyword, is_active, page = 1, pageSize = 20 } = req.query;

    const filter = { category };
    if (is_active !== undefined) {
      filter.is_active = is_active;
    }
    if (keyword) {
      filter.label = { $regex: keyword, $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);

    const [items, total] = await Promise.all([
      db.collection('dictionaries')
        .find(filter)
        .sort({ sort_order: 1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('dictionaries').countDocuments(filter),
    ]);

    res.json({
      code: 0,
      data: { items, total, page: Number(page), pageSize: limit },
    });
  } catch (err) {
    console.error('List dictionaries error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/dictionaries/options?category=project_no
 * Returns only active items for dropdown use (no pagination).
 */
async function listOptions(req, res) {
  try {
    const db = getDB();
    const { category } = req.query;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ code: 1, message: '无效的字典分类' });
    }

    const items = await db.collection('dictionaries')
      .find({ category, is_active: true })
      .sort({ sort_order: 1, created_at: -1 })
      .project({ label: 1, _id: 0 })
      .toArray();

    res.json({ code: 0, data: items.map(i => i.label) });
  } catch (err) {
    console.error('List options error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/dictionaries
 * Body: { category, label }
 */
async function createDictionary(req, res) {
  try {
    const { category, label } = req.body;
    const db = getDB();

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ code: 1, message: '无效的字典分类' });
    }

    // Check duplicate
    const existing = await db.collection('dictionaries').findOne({ category, label });
    if (existing) {
      return res.status(409).json({ code: 1, message: `${CATEGORY_LABELS[category]} "${label}" 已存在` });
    }

    const doc = {
      category,
      label,
      is_active: true,
      sort_order: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection('dictionaries').insertOne(doc);

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Dictionary',
      action_type: '新增字典项',
      operator: req.user.username,
      details: `新增${CATEGORY_LABELS[category]}: ${label}`,
      created_at: new Date(),
    });

    res.status(201).json({ code: 0, message: '字典项创建成功', data: doc });
  } catch (err) {
    console.error('Create dictionary error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * PATCH /api/dictionaries/:id
 * Body: { label?, is_active? }
 */
async function updateDictionary(req, res) {
  try {
    const { id } = req.params;
    const { label, is_active } = req.body;
    const db = getDB();

    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return res.status(400).json({ code: 1, message: '无效的ID格式' });
    }

    const existing = await db.collection('dictionaries').findOne({ _id: objectId });
    if (!existing) {
      return res.status(404).json({ code: 1, message: '字典项不存在' });
    }

    const updateFields = { updated_at: new Date() };
    const changes = [];

    if (label !== undefined && label !== existing.label) {
      // Check duplicate
      const dup = await db.collection('dictionaries').findOne({
        category: existing.category,
        label,
        _id: { $ne: objectId },
      });
      if (dup) {
        return res.status(409).json({
          code: 1,
          message: `${CATEGORY_LABELS[existing.category]} "${label}" 已存在`,
        });
      }
      updateFields.label = label;
      changes.push(`名称: ${existing.label} → ${label}`);
    }

    if (is_active !== undefined) {
      updateFields.is_active = is_active;
      changes.push(`状态: ${is_active ? '启用' : '停用'}`);
    }

    if (changes.length === 0) {
      return res.status(400).json({ code: 1, message: '没有需要更新的字段' });
    }

    await db.collection('dictionaries').updateOne(
      { _id: objectId },
      { $set: updateFields }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Dictionary',
      action_type: '编辑字典项',
      operator: req.user.username,
      details: `编辑${CATEGORY_LABELS[existing.category]} "${existing.label}": ${changes.join(', ')}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '字典项更新成功' });
  } catch (err) {
    console.error('Update dictionary error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * DELETE /api/dictionaries/:id
 */
async function deleteDictionary(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();

    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return res.status(400).json({ code: 1, message: '无效的ID格式' });
    }

    const existing = await db.collection('dictionaries').findOne({ _id: objectId });
    if (!existing) {
      return res.status(404).json({ code: 1, message: '字典项不存在' });
    }

    await db.collection('dictionaries').deleteOne({ _id: objectId });

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Dictionary',
      action_type: '删除字典项',
      operator: req.user.username,
      details: `删除${CATEGORY_LABELS[existing.category]}: ${existing.label}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '字典项删除成功' });
  } catch (err) {
    console.error('Delete dictionary error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listDictionaries, listOptions, createDictionary, updateDictionary, deleteDictionary };
