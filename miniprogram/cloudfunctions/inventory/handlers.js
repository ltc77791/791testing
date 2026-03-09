/**
 * Inventory handlers — 云函数版本
 * 从 server/src/handlers/inventory.js 适配，移除 ObjectId 依赖
 */

const { getDB } = require('./db-adapter');

async function listInventory(req, res) {
  try {
    const db = getDB();
    const { part_no, subsidiary, status, keyword, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (part_no) filter.part_no = part_no;
    if (subsidiary) filter.subsidiary = subsidiary;
    if (status !== undefined) filter.status = Number(status);
    if (keyword) {
      const regex = { $regex: keyword, $options: 'i' };
      filter.$or = [
        { serial_number: regex },
        { part_no: regex },
        { part_name: regex },
        { warehouse: regex },
      ];
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);

    const [items, total] = await Promise.all([
      db.collection('inventory').find(filter).sort({ inbound_time: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('inventory').countDocuments(filter),
    ]);

    res.json({ code: 0, data: { items, total, page: Number(page), pageSize: limit } });
  } catch (err) {
    console.error('List inventory error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function inbound(req, res) {
  try {
    const { part_no, serial_number, subsidiary, warehouse, condition } = req.body;
    const cond = condition;
    const db = getDB();

    const partType = await db.collection('part_types').findOne({ part_no });
    if (!partType) {
      return res.status(400).json({ code: 1, message: `备件类型 ${part_no} 不存在，请先创建` });
    }

    const existing = await db.collection('inventory').findOne({ serial_number });
    if (existing) {
      return res.status(409).json({ code: 1, message: `序列号 ${serial_number} 已存在` });
    }

    const now = new Date();
    const doc = {
      part_no, part_name: partType.part_name, serial_number, subsidiary, warehouse,
      condition: cond, status: 0, inbound_time: now, inbound_operator: req.user.username,
      outbound_time: null, receiver: null, approver: null, project_location: null, reserved_request_id: '',
    };

    await db.collection('inventory').insertOne(doc);
    await db.collection('part_types').updateOne({ part_no }, { $inc: { current_stock: 1 }, $set: { updated_at: now } });
    await db.collection('counters').updateOne({ _id: 'stats' }, { $inc: { total_in_stock: 1, month_inbound: 1 }, $set: { updated_at: now } });
    await db.collection('sys_logs').insertOne({
      category: 'Inbound', action_type: cond === '全新' ? '新品入库' : '利旧回流',
      operator: req.user.username,
      details: `入库: ${part_no} SN:${serial_number}, ${subsidiary}-${warehouse}, 成色:${cond}`,
      created_at: now,
    });

    res.status(201).json({ code: 0, message: '入库成功', data: doc });
  } catch (err) {
    console.error('Inbound error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function editInventory(req, res) {
  try {
    const { id } = req.params;
    const { subsidiary, warehouse, condition, part_no } = req.body;
    const db = getDB();

    // 云数据库使用字符串 _id，先按 _id 查找，再按 serial_number 查找
    let record = await db.collection('inventory').findOne({ _id: id });
    if (!record) {
      record = await db.collection('inventory').findOne({ serial_number: id });
    }
    if (!record) {
      return res.status(404).json({ code: 1, message: '库存记录不存在' });
    }

    const updateFields = {};
    const changes = [];

    if (subsidiary !== undefined) { updateFields.subsidiary = subsidiary; changes.push(`子公司: ${subsidiary}`); }
    if (warehouse !== undefined) { updateFields.warehouse = warehouse; changes.push(`仓库: ${warehouse}`); }
    if (condition !== undefined) { updateFields.condition = condition; changes.push(`成色: ${condition}`); }

    if (part_no !== undefined && part_no !== record.part_no) {
      const newPartType = await db.collection('part_types').findOne({ part_no });
      if (!newPartType) {
        return res.status(400).json({ code: 1, message: `备件类型 ${part_no} 不存在` });
      }
      updateFields.part_no = part_no;
      updateFields.part_name = newPartType.part_name;
      changes.push(`备件类型: ${record.part_no} → ${part_no}`);

      if (record.status === 0) {
        const now = new Date();
        await db.collection('part_types').updateOne({ part_no: record.part_no }, { $inc: { current_stock: -1 }, $set: { updated_at: now } });
        await db.collection('part_types').updateOne({ part_no }, { $inc: { current_stock: 1 }, $set: { updated_at: now } });
      }
    }

    if (changes.length === 0) {
      return res.status(400).json({ code: 1, message: '没有需要更新的字段' });
    }

    await db.collection('inventory').updateOne({ _id: record._id }, { $set: updateFields });
    await db.collection('sys_logs').insertOne({
      category: 'InventoryEdit', action_type: '编辑库存', operator: req.user.username,
      details: `编辑 SN:${record.serial_number}: ${changes.join(', ')}`, created_at: new Date(),
    });

    res.json({ code: 0, message: '库存记录更新成功' });
  } catch (err) {
    console.error('Edit inventory error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function scanBySN(req, res) {
  try {
    const { sn } = req.params;
    const db = getDB();
    const record = await db.collection('inventory').findOne({ serial_number: sn });
    if (!record) {
      return res.status(404).json({ code: 1, message: `未找到序列号: ${sn}` });
    }
    res.json({ code: 0, data: record });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function batchImport(req, res) {
  try {
    const { items } = req.body;
    const db = getDB();
    const now = new Date();
    const results = { success: 0, failed: 0, errors: [] };

    const partNos = [...new Set(items.map(i => i.part_no))];
    const partTypes = await db.collection('part_types').find({ part_no: { $in: partNos } }).toArray();
    const partTypeMap = new Map(partTypes.map(p => [p.part_no, p]));

    const sns = items.map(i => i.serial_number).filter(Boolean);
    const existingSNs = await db.collection('inventory').find({ serial_number: { $in: sns } }).project({ serial_number: 1 }).toArray();
    const existingSNSet = new Set(existingSNs.map(r => r.serial_number));
    const batchSNSet = new Set();

    const validDocs = [];
    const stockIncrements = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = i + 1;

      if (!item.part_no || !item.serial_number || !item.subsidiary || !item.warehouse) {
        results.failed++; results.errors.push({ row, message: '缺少必填字段' }); continue;
      }
      const partType = partTypeMap.get(item.part_no);
      if (!partType) {
        results.failed++; results.errors.push({ row, message: `备件类型 ${item.part_no} 不存在` }); continue;
      }
      if (existingSNSet.has(item.serial_number) || batchSNSet.has(item.serial_number)) {
        results.failed++; results.errors.push({ row, message: `序列号 ${item.serial_number} 重复` }); continue;
      }
      const cond = item.condition || '全新';
      if (!['全新', '利旧/返还'].includes(cond)) {
        results.failed++; results.errors.push({ row, message: `无效成色: ${cond}` }); continue;
      }

      batchSNSet.add(item.serial_number);
      validDocs.push({
        part_no: item.part_no, part_name: partType.part_name, serial_number: item.serial_number,
        subsidiary: item.subsidiary, warehouse: item.warehouse, condition: cond, status: 0,
        inbound_time: now, inbound_operator: req.user.username,
        outbound_time: null, receiver: null, approver: null, project_location: null, reserved_request_id: '',
      });
      stockIncrements[item.part_no] = (stockIncrements[item.part_no] || 0) + 1;
    }

    if (validDocs.length > 0) {
      await db.collection('inventory').insertMany(validDocs);
      results.success = validDocs.length;

      const stockUpdates = Object.entries(stockIncrements).map(([pno, inc]) =>
        db.collection('part_types').updateOne({ part_no: pno }, { $inc: { current_stock: inc }, $set: { updated_at: now } })
      );
      await Promise.all(stockUpdates);

      await db.collection('counters').updateOne(
        { _id: 'stats' },
        { $inc: { total_in_stock: validDocs.length, month_inbound: validDocs.length }, $set: { updated_at: now } }
      );
      await db.collection('sys_logs').insertOne({
        category: 'Inbound', action_type: '批量导入', operator: req.user.username,
        details: `批量导入 ${validDocs.length} 条，失败 ${results.failed} 条`, created_at: now,
      });
    }

    res.json({ code: 0, data: results });
  } catch (err) {
    console.error('Batch import error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listInventory, inbound, editInventory, scanBySN, batchImport };
