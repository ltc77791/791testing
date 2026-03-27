const { getDB } = require('../db');
const { escapeRegex } = require('../utils/escape-regex');

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
      const regex = { $regex: escapeRegex(keyword), $options: 'i' };
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
    let { part_no, part_name, value_type, model, unit_price, min_stock } = req.body;

    // ★ Feature #1: Normalize part_no to uppercase
    if (part_no) part_no = part_no.toUpperCase().trim();

    const db = getDB();

    // Check duplicate
    const existing = await db.collection('part_types').findOne({ part_no });
    if (existing) {
      return res.status(409).json({ code: 1, message: `备件编号 ${part_no} 已存在` });
    }

    const doc = {
      part_no,
      part_name,
      value_type: value_type || '高价值',
      model: model || '',
      unit_price: (unit_price !== null && unit_price !== undefined && unit_price !== '') ? Number(unit_price) : null,
      min_stock: Number(min_stock) || 0,
      current_stock: 0,
      total_outbound: 0,
      updated_at: new Date(),
    };

    await db.collection('part_types').insertOne(doc);

    // Log
    const logParts = [`新增备件类型: ${part_no} - ${part_name}, 价值: ${doc.value_type}`];
    if (doc.model) logParts.push(`型号: ${doc.model}`);
    if (doc.unit_price !== null) logParts.push(`单价: ${doc.unit_price}`);
    logParts.push(`安全库存: ${doc.min_stock}`);
    await db.collection('sys_logs').insertOne({
      category: 'PartType',
      action_type: '新增备件类型',
      operator: req.user.username,
      details: logParts.join(', '),
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
    const { part_name, value_type, model, unit_price, min_stock } = req.body;

    const db = getDB();
    const existing = await db.collection('part_types').findOne({ part_no });
    if (!existing) {
      return res.status(404).json({ code: 1, message: '备件类型不存在' });
    }

    // 交叉校验：编辑时若 value_type 变为高价值（或保持高价值），型号必填
    const effectiveValueType = value_type !== undefined ? value_type : existing.value_type;
    const effectiveModel = model !== undefined ? model : (existing.model || '');
    if (effectiveValueType === '高价值' && (!effectiveModel || !effectiveModel.trim())) {
      return res.status(400).json({ code: 1, message: '高价值备件的型号为必填项' });
    }

    const updateFields = { updated_at: new Date() };
    const changes = [];

    if (part_name !== undefined) {
      updateFields.part_name = part_name;
      changes.push(`名称: ${part_name}`);
    }

    if (value_type !== undefined) {
      updateFields.value_type = value_type;
      changes.push(`价值类型: ${value_type}`);
    }

    if (model !== undefined) {
      updateFields.model = model;
      changes.push(`型号: ${model || '(清空)'}`);
    }

    if (unit_price !== undefined) {
      updateFields.unit_price = (unit_price !== null && unit_price !== '') ? Number(unit_price) : null;
      changes.push(`单价: ${updateFields.unit_price !== null ? updateFields.unit_price : '(清空)'}`);
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

    // Sync denormalized fields to inventory
    const invSync = {};
    if (part_name !== undefined) invSync.part_name = part_name;
    if (value_type !== undefined) invSync.value_type = value_type;
    if (Object.keys(invSync).length > 0) {
      await db.collection('inventory').updateMany(
        { part_no },
        { $set: invSync }
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

/**
 * POST /api/part-types/batch-import
 * Body: { items: [{ part_no, part_name, value_type?, model?, unit_price?, min_stock? }] }
 */
async function batchImportPartTypes(req, res) {
  try {
    const { items } = req.body;
    const db = getDB();

    let success = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      try {
        // ★ Feature #1: Normalize part_no to uppercase
        if (item.part_no) item.part_no = item.part_no.toUpperCase().trim();

        // 高价值备件型号必填
        const valueType = item.value_type || '高价值';
        if (valueType === '高价值' && (!item.model || !item.model.trim())) {
          errors.push({ row: rowNum, message: `备件编号 ${item.part_no}: 高价值备件型号为必填项` });
          failed++;
          continue;
        }

        // Check duplicate
        const existing = await db.collection('part_types').findOne({ part_no: item.part_no });
        if (existing) {
          errors.push({ row: rowNum, message: `备件编号 ${item.part_no} 已存在，跳过` });
          failed++;
          continue;
        }

        const doc = {
          part_no: item.part_no,
          part_name: item.part_name,
          value_type: valueType,
          model: item.model || '',
          unit_price: (item.unit_price !== null && item.unit_price !== undefined && item.unit_price !== '') ? Number(item.unit_price) : null,
          min_stock: Number(item.min_stock) || 0,
          current_stock: 0,
          total_outbound: 0,
          updated_at: new Date(),
        };

        await db.collection('part_types').insertOne(doc);
        success++;
      } catch (err) {
        errors.push({ row: rowNum, message: `备件编号 ${item.part_no}: ${err.message}` });
        failed++;
      }
    }

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'PartType',
      action_type: '批量导入备件类型',
      operator: req.user.username,
      details: `批量导入备件类型: 成功 ${success} 条, 失败 ${failed} 条`,
      created_at: new Date(),
    });

    res.json({ code: 0, data: { success, failed, errors } });
  } catch (err) {
    console.error('Batch import part types error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listPartTypes, createPartType, updatePartType, deletePartType, batchImportPartTypes };
