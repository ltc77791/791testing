const { getDB } = require('../db');

/**
 * GET /api/part-types
 * Query: ?keyword=xxx&page=1&pageSize=20
 * Returns paginated part types list.
 */
async function listPartTypes(req, res) {
  try {
    const db = getDB();
    const { keyword, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (keyword) {
      const regex = { $regex: keyword, $options: 'i' };
      filter.$or = [{ part_no: regex }, { part_name: regex }];
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);

    const [items, total] = await Promise.all([
      db.collection('part_types')
        .find(filter)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('part_types').countDocuments(filter),
    ]);

    res.json({
      code: 0,
      data: { items, total, page: Number(page), pageSize: limit },
    });
  } catch (err) {
    console.error('List part types error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/part-types
 * Body: { part_no, part_name, min_stock? }
 */
async function createPartType(req, res) {
  try {
    const { part_no, part_name, min_stock } = req.body;

    if (!part_no || !part_name) {
      return res.status(400).json({ code: 1, message: '备件编号和名称不能为空' });
    }

    const db = getDB();

    // Check duplicate
    const existing = await db.collection('part_types').findOne({ part_no });
    if (existing) {
      return res.status(409).json({ code: 1, message: `备件编号 ${part_no} 已存在` });
    }

    const doc = {
      part_no,
      part_name,
      min_stock: Number(min_stock) || 0,
      current_stock: 0,
      total_outbound: 0,
      updated_at: new Date(),
    };

    await db.collection('part_types').insertOne(doc);

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'PartType',
      action_type: '新增备件类型',
      operator: req.user.username,
      details: `新增备件类型: ${part_no} - ${part_name}, 安全库存: ${doc.min_stock}`,
      created_at: new Date(),
    });

    res.status(201).json({ code: 0, message: '备件类型创建成功', data: doc });
  } catch (err) {
    console.error('Create part type error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * PATCH /api/part-types/:part_no
 * Body: { part_name?, min_stock? }
 */
async function updatePartType(req, res) {
  try {
    const { part_no } = req.params;
    const { part_name, min_stock } = req.body;

    const db = getDB();
    const existing = await db.collection('part_types').findOne({ part_no });
    if (!existing) {
      return res.status(404).json({ code: 1, message: '备件类型不存在' });
    }

    const updateFields = { updated_at: new Date() };
    const changes = [];

    if (part_name !== undefined) {
      updateFields.part_name = part_name;
      changes.push(`名称: ${part_name}`);
    }

    if (min_stock !== undefined) {
      updateFields.min_stock = Number(min_stock);
      changes.push(`安全库存: ${min_stock}`);
    }

    if (changes.length === 0) {
      return res.status(400).json({ code: 1, message: '没有需要更新的字段' });
    }

    await db.collection('part_types').updateOne(
      { part_no },
      { $set: updateFields }
    );

    // If part_name changed, also update the denormalized field in inventory
    if (part_name !== undefined) {
      await db.collection('inventory').updateMany(
        { part_no },
        { $set: { part_name } }
      );
    }

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'PartType',
      action_type: '编辑备件类型',
      operator: req.user.username,
      details: `编辑备件类型 ${part_no}: ${changes.join(', ')}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '备件类型更新成功' });
  } catch (err) {
    console.error('Update part type error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * DELETE /api/part-types/:part_no
 * Cannot delete if inventory records reference this part_no.
 */
async function deletePartType(req, res) {
  try {
    const { part_no } = req.params;

    const db = getDB();
    const existing = await db.collection('part_types').findOne({ part_no });
    if (!existing) {
      return res.status(404).json({ code: 1, message: '备件类型不存在' });
    }

    // Check if any inventory records reference this part_no
    const invCount = await db.collection('inventory').countDocuments({ part_no });
    if (invCount > 0) {
      return res.status(400).json({
        code: 1,
        message: `该备件类型下有 ${invCount} 条库存记录，无法删除`,
      });
    }

    // Also check pending requests
    const reqCount = await db.collection('requests').countDocuments({
      part_no,
      status: 'pending',
    });
    if (reqCount > 0) {
      return res.status(400).json({
        code: 1,
        message: `该备件类型有 ${reqCount} 条待审批申请，无法删除`,
      });
    }

    await db.collection('part_types').deleteOne({ part_no });

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'PartType',
      action_type: '删除备件类型',
      operator: req.user.username,
      details: `删除备件类型: ${part_no} - ${existing.part_name}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '备件类型删除成功' });
  } catch (err) {
    console.error('Delete part type error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listPartTypes, createPartType, updatePartType, deletePartType };
