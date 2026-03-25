const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const { checkAndNotifyStockAlert } = require('../utils/subscribe-message');

/**
 * 为低价值备件自动生成序列号，格式: nucyyyymmdd0001
 * 使用 MongoDB counters 集合保证每日递增且唯一
 */
async function generateAutoSN() {
  const db = getDB();
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const counterDoc = await db.collection('counters').findOneAndUpdate(
    { _id: `sn_daily_${dateStr}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  const seq = counterDoc.seq.toString().padStart(4, '0');
  return `nuc${dateStr}${seq}`;
}

/**
 * GET /api/inventory
 * Query: ?part_no=&subsidiary=&status=0|1&keyword=&page=1&pageSize=20
 */
async function listInventory(req, res) {
  try {
    const db = getDB();
    const { part_no, subsidiary, status, contract_no, keyword, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (part_no) filter.part_no = part_no;
    if (subsidiary) filter.subsidiary = subsidiary;
    if (contract_no) filter.contract_no = contract_no;
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
      db.collection('inventory')
        .find(filter)
        .sort({ inbound_time: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('inventory').countDocuments(filter),
    ]);

    res.json({
      code: 0,
      data: { items, total, page: Number(page), pageSize: limit },
    });
  } catch (err) {
    console.error('List inventory error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/inventory/inbound
 * Body: { part_no, serial_number, subsidiary, warehouse, condition }
 * condition: "全新" | "利旧/返还"
 */
async function inbound(req, res) {
  try {
    let { part_no, serial_number, subsidiary, warehouse, condition, contract_no } = req.body;
    const cond = condition;

    const db = getDB();

    // Verify part_no exists
    const partType = await db.collection('part_types').findOne({ part_no });
    if (!partType) {
      return res.status(400).json({ code: 1, message: `备件类型 ${part_no} 不存在，请先创建` });
    }

    const isHighValue = (partType.value_type || '高价值') === '高价值';

    // 高价值备件序列号必填
    if (isHighValue && !serial_number) {
      return res.status(400).json({ code: 1, message: '高价值备件序列号为必填项' });
    }

    // 低价值备件序列号非必填，自动生成
    if (!serial_number) {
      serial_number = await generateAutoSN();
    }

    // Check duplicate serial_number
    const existing = await db.collection('inventory').findOne({ serial_number });
    if (existing) {
      return res.status(409).json({ code: 1, message: `序列号 ${serial_number} 已存在` });
    }

    const now = new Date();
    const doc = {
      part_no,
      part_name: partType.part_name,
      value_type: partType.value_type || '高价值',
      serial_number,
      subsidiary,
      warehouse,
      condition: cond,
      contract_no,
      status: 0, // 在库
      inbound_time: now,
      inbound_operator: req.user.username,
      outbound_time: null,
      receiver: null,
      approver: null,
      project_location: null,
      reserved_request_id: '',
    };

    await db.collection('inventory').insertOne(doc);

    // Atomically update part_types.current_stock
    await db.collection('part_types').updateOne(
      { part_no },
      { $inc: { current_stock: 1 }, $set: { updated_at: now } }
    );

    // Atomically update counters
    await db.collection('counters').updateOne(
      { _id: 'stats' },
      { $inc: { total_in_stock: 1, month_inbound: 1 }, $set: { updated_at: now } }
    );

    // Log
    const snLog = isHighValue ? `SN:${serial_number}` : `SN:${serial_number}(自动)`;
    await db.collection('sys_logs').insertOne({
      category: 'Inbound',
      action_type: cond === '全新' ? '新品入库' : '利旧回流',
      operator: req.user.username,
      details: `入库: ${part_no} ${snLog}, ${subsidiary}-${warehouse}, 成色:${cond}, 合同:${contract_no}`,
      created_at: now,
    });

    res.status(201).json({ code: 0, message: '入库成功', data: doc });

    // 异步检查库存预警
    checkAndNotifyStockAlert([part_no])
      .catch(err => console.warn('库存预警检查失败:', err.message));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ code: 1, message: '序列号已存在（重复入库）' });
    }
    console.error('Inbound error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * PATCH /api/inventory/:id
 * :id can be a MongoDB ObjectId OR a serial_number (SN)
 * Body: { subsidiary?, warehouse?, condition?, part_no? }
 */
async function editInventory(req, res) {
  try {
    const { id } = req.params;
    const { subsidiary, warehouse, condition, part_no } = req.body;

    const db = getDB();

    // Support both ObjectId and serial_number lookup
    let record;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      record = await db.collection('inventory').findOne({ _id: new ObjectId(id) });
    }
    if (!record) {
      record = await db.collection('inventory').findOne({ serial_number: id });
    }
    if (!record) {
      return res.status(404).json({ code: 1, message: '库存记录不存在' });
    }

    const updateFields = {};
    const changes = [];

    if (subsidiary !== undefined) {
      updateFields.subsidiary = subsidiary;
      changes.push(`子公司: ${subsidiary}`);
    }
    if (warehouse !== undefined) {
      updateFields.warehouse = warehouse;
      changes.push(`仓库: ${warehouse}`);
    }
    if (condition !== undefined) {
      updateFields.condition = condition;
      changes.push(`成色: ${condition}`);
    }

    // If part_no changes, adjust current_stock on both old and new part_types
    if (part_no !== undefined && part_no !== record.part_no) {
      const newPartType = await db.collection('part_types').findOne({ part_no });
      if (!newPartType) {
        return res.status(400).json({ code: 1, message: `备件类型 ${part_no} 不存在` });
      }
      updateFields.part_no = part_no;
      updateFields.part_name = newPartType.part_name;
      updateFields.value_type = newPartType.value_type || '高价值';
      changes.push(`备件类型: ${record.part_no} → ${part_no}`);

      // Only adjust stock if the item is currently in stock
      if (record.status === 0) {
        const now = new Date();
        await db.collection('part_types').updateOne(
          { part_no: record.part_no },
          { $inc: { current_stock: -1 }, $set: { updated_at: now } }
        );
        await db.collection('part_types').updateOne(
          { part_no },
          { $inc: { current_stock: 1 }, $set: { updated_at: now } }
        );
      }
    }

    if (changes.length === 0) {
      return res.status(400).json({ code: 1, message: '没有需要更新的字段' });
    }

    await db.collection('inventory').updateOne(
      { _id: record._id },
      { $set: updateFields }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'InventoryEdit',
      action_type: '编辑库存',
      operator: req.user.username,
      details: `编辑 SN:${record.serial_number}: ${changes.join(', ')}`,
      created_at: new Date(),
    });

    res.json({ code: 0, message: '库存记录更新成功' });
  } catch (err) {
    console.error('Edit inventory error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/inventory/scan/:sn
 * Exact match by serial_number.
 */
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

/**
 * POST /api/inventory/batch-import
 * Body: { items: [{ part_no, serial_number, subsidiary, warehouse, condition }] }
 */
async function batchImport(req, res) {
  try {
    const { items } = req.body;

    const db = getDB();
    const now = new Date();
    const results = { success: 0, failed: 0, errors: [] };

    // Pre-fetch all part_types for validation
    const partNos = [...new Set(items.map(i => i.part_no))];
    const partTypes = await db.collection('part_types')
      .find({ part_no: { $in: partNos } })
      .toArray();
    const partTypeMap = new Map(partTypes.map(p => [p.part_no, p]));

    // Pre-check existing serial numbers (only check user-provided ones)
    const sns = items.map(i => i.serial_number).filter(Boolean);
    const existingSNs = await db.collection('inventory')
      .find({ serial_number: { $in: sns } })
      .project({ serial_number: 1 })
      .toArray();
    const existingSNSet = new Set(existingSNs.map(r => r.serial_number));

    // Track SNs within this batch to detect intra-batch duplicates
    const batchSNSet = new Set();

    // Collect valid docs and per-partNo increments
    const validDocs = [];
    const stockIncrements = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = i + 1;

      if (!item.part_no || !item.subsidiary || !item.warehouse) {
        results.failed++;
        results.errors.push({ row, message: '缺少必填字段' });
        continue;
      }

      const partType = partTypeMap.get(item.part_no);
      if (!partType) {
        results.failed++;
        results.errors.push({ row, message: `备件类型 ${item.part_no} 不存在` });
        continue;
      }

      const isHighValue = (partType.value_type || '高价值') === '高价值';

      // 高价值备件序列号必填
      if (isHighValue && !item.serial_number) {
        results.failed++;
        results.errors.push({ row, message: '高价值备件序列号为必填项' });
        continue;
      }

      // 低价值备件无序列号时自动生成
      const sn = item.serial_number || await generateAutoSN();

      if (existingSNSet.has(sn) || batchSNSet.has(sn)) {
        results.failed++;
        results.errors.push({ row, message: `序列号 ${sn} 重复` });
        continue;
      }

      const cond = item.condition || '全新';
      if (!['全新', '利旧/返还'].includes(cond)) {
        results.failed++;
        results.errors.push({ row, message: `无效成色: ${cond}` });
        continue;
      }

      batchSNSet.add(sn);

      validDocs.push({
        part_no: item.part_no,
        part_name: partType.part_name,
        value_type: partType.value_type || '高价值',
        serial_number: sn,
        subsidiary: item.subsidiary,
        warehouse: item.warehouse,
        condition: cond,
        contract_no: item.contract_no,
        status: 0,
        inbound_time: now,
        inbound_operator: req.user.username,
        outbound_time: null,
        receiver: null,
        approver: null,
        project_location: null,
        reserved_request_id: '',
      });

      stockIncrements[item.part_no] = (stockIncrements[item.part_no] || 0) + 1;
    }

    // Bulk insert valid documents
    if (validDocs.length > 0) {
      await db.collection('inventory').insertMany(validDocs, { ordered: false });
      results.success = validDocs.length;

      // Update part_types current_stock for each part_no
      const stockUpdates = Object.entries(stockIncrements).map(([pno, inc]) =>
        db.collection('part_types').updateOne(
          { part_no: pno },
          { $inc: { current_stock: inc }, $set: { updated_at: now } }
        )
      );
      await Promise.all(stockUpdates);

      // Update counters
      await db.collection('counters').updateOne(
        { _id: 'stats' },
        {
          $inc: { total_in_stock: validDocs.length, month_inbound: validDocs.length },
          $set: { updated_at: now },
        }
      );

      // Log
      await db.collection('sys_logs').insertOne({
        category: 'Inbound',
        action_type: '批量导入',
        operator: req.user.username,
        details: `批量导入 ${validDocs.length} 条，失败 ${results.failed} 条`,
        created_at: now,
      });
    }

    res.json({ code: 0, data: results });

    // 异步检查库存预警
    if (Object.keys(stockIncrements).length > 0) {
      checkAndNotifyStockAlert(Object.keys(stockIncrements))
        .catch(err => console.warn('库存预警检查失败:', err.message));
    }
  } catch (err) {
    console.error('Batch import error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listInventory, inbound, editInventory, scanBySN, batchImport };
