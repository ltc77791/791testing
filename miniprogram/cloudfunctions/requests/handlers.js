/**
 * Requests handlers — 云函数版本
 * 从 server/src/handlers/requests.js 适配，移除 ObjectId 依赖
 * 云数据库使用字符串 _id
 */

const { getDB } = require('./db-adapter');
const { notifyRequestSubmitted, notifyApprovalResult, checkAndNotifyStockAlert } = require('./subscribe-message');

async function createRequest(req, res) {
  try {
    // 权限检查：仅 operator 可提交申请（审批者不可申请）
    const userRoles = req.user.roles || [];
    if (userRoles.includes('admin') || userRoles.includes('manager')) {
      return res.status(403).json({ code: 1, message: '审批角色不可提交申请，请使用操作员账号' });
    }
    if (!userRoles.includes('operator')) {
      return res.status(403).json({ code: 1, message: '无权限提交申请' });
    }

    const { items, project_location, project_no, outbound_reason, remark } = req.body;
    const db = getDB();
    const now = new Date();

    // Validate outbound_reason
    const validReasons = ['维修', '调用', '销售'];
    if (!outbound_reason || !validReasons.includes(outbound_reason)) {
      return res.status(400).json({ code: 1, message: '出库原因必须为: 维修, 调用, 销售' });
    }

    const reservedSNs = [];
    const requestItems = [];

    for (const item of items) {
      if (!item.part_no || !item.quantity || item.quantity < 1) {
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } }, { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({ code: 1, message: `无效的申请项: ${JSON.stringify(item)}` });
      }

      const partType = await db.collection('part_types').findOne({ part_no: item.part_no });
      if (!partType) {
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } }, { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({ code: 1, message: `备件类型 ${item.part_no} 不存在` });
      }

      const available = await db.collection('inventory')
        .find({ part_no: item.part_no, status: 0, reserved_request_id: '' })
        .limit(item.quantity).toArray();

      if (available.length < item.quantity) {
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } }, { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({
          code: 1, message: `${item.part_no} 库存不足，需要 ${item.quantity}，可用 ${available.length}`,
        });
      }

      const sns = available.map(r => r.serial_number);
      reservedSNs.push(...sns);
      requestItems.push({
        part_no: item.part_no, part_name: partType.part_name,
        quantity: item.quantity, serial_numbers: sns,
      });
    }

    const requestDoc = {
      applicant: req.user.username, status: 'pending',
      items: requestItems, project_location, project_no, outbound_reason, remark: remark || '',
      created_at: now, updated_at: now,
      approved_by: null, approved_at: null, reject_reason: null,
    };

    const result = await db.collection('requests').insertOne(requestDoc);
    const requestId = result.insertedId.toString();

    await db.collection('inventory').updateMany(
      { serial_number: { $in: reservedSNs } }, { $set: { reserved_request_id: requestId } }
    );
    await db.collection('counters').updateOne(
      { _id: 'stats' }, { $inc: { pending_requests: 1 }, $set: { updated_at: now } }
    );
    await db.collection('sys_logs').insertOne({
      category: 'Request', action_type: '提交申请', operator: req.user.username,
      details: `申请出库: ${requestItems.map(i => `${i.part_no}×${i.quantity}`).join(', ')} → ${project_location}`,
      created_at: now,
    });

    // 发送订阅消息通知 manager/admin（加调试日志）
    console.log('[notify] === 开始发送申请提交通知 ===');
    try {
      await notifyRequestSubmitted({
        db, applicant: req.user.username, items: requestItems, projectLocation: project_location,
      });
      console.log('[notify] 申请提交通知完成');
    } catch (e) {
      console.error('[notify] 申请提交通知失败:', e);
    }

    res.status(201).json({ code: 0, message: '申请提交成功', data: { _id: requestId, ...requestDoc } });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function listRequests(req, res) {
  try {
    const db = getDB();
    const { status, applicant, page = 1, pageSize = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (applicant) filter.applicant = applicant;

    const userRoles = req.user.roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('manager')) {
      filter.applicant = req.user.username;
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);

    const [items, total] = await Promise.all([
      db.collection('requests').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('requests').countDocuments(filter),
    ]);

    res.json({ code: 0, data: { items, total, page: Number(page), pageSize: limit } });
  } catch (err) {
    console.error('List requests error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getRequest(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();

    // 云数据库使用字符串 _id
    const doc = await db.collection('requests').findOne({ _id: id });
    if (!doc) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }

    const userRoles = req.user.roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('manager') && doc.applicant !== req.user.username) {
      return res.status(403).json({ code: 1, message: '无权查看此申请' });
    }

    res.json({ code: 0, data: doc });
  } catch (err) {
    console.error('Get request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function approveRequest(req, res) {
  try {
    const { id } = req.params;
    const { partial_items } = req.body;
    const db = getDB();

    const request = await db.collection('requests').findOne({ _id: id });
    if (!request) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 1, message: `申请当前状态为 ${request.status}，无法审批` });
    }

    const now = new Date();
    const requestId = id;

    let approvedSNs = [];
    let releasedSNs = [];
    let outboundCount = 0;
    const stockDecrements = {};

    if (partial_items && Array.isArray(partial_items)) {
      for (const pi of partial_items) {
        const reqItem = request.items.find(i => i.part_no === pi.part_no);
        if (!reqItem) continue;
        const requestedSNs = new Set(pi.serial_numbers);
        for (const sn of reqItem.serial_numbers) {
          if (requestedSNs.has(sn)) approvedSNs.push(sn);
          else releasedSNs.push(sn);
        }
        outboundCount += approvedSNs.length;
        if (approvedSNs.length > 0) {
          stockDecrements[pi.part_no] = (stockDecrements[pi.part_no] || 0) + approvedSNs.length;
        }
      }
      for (const reqItem of request.items) {
        if (!partial_items.find(pi => pi.part_no === reqItem.part_no)) {
          releasedSNs.push(...reqItem.serial_numbers);
        }
      }
    } else {
      for (const reqItem of request.items) {
        approvedSNs.push(...reqItem.serial_numbers);
        outboundCount += reqItem.serial_numbers.length;
        stockDecrements[reqItem.part_no] = (stockDecrements[reqItem.part_no] || 0) + reqItem.serial_numbers.length;
      }
    }

    if (approvedSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: approvedSNs } },
        { $set: { status: 1, outbound_time: now, receiver: request.applicant, approver: req.user.username, project_location: request.project_location } }
      );
    }

    if (releasedSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: releasedSNs } }, { $set: { reserved_request_id: '' } }
      );
    }

    const stockUpdates = Object.entries(stockDecrements).map(([pno, dec]) =>
      db.collection('part_types').updateOne({ part_no: pno }, { $inc: { current_stock: -dec }, $set: { updated_at: now } })
    );
    await Promise.all(stockUpdates);

    await db.collection('counters').updateOne(
      { _id: 'stats' },
      { $inc: { pending_requests: -1, total_in_stock: -outboundCount, total_out_of_stock: outboundCount, month_outbound: outboundCount }, $set: { updated_at: now } }
    );

    await db.collection('requests').updateOne(
      { _id: id },
      { $set: { status: 'approved', approved_by: req.user.username, approved_at: now, updated_at: now } }
    );

    await db.collection('sys_logs').insertOne({
      category: 'Request', action_type: '审批通过', operator: req.user.username,
      details: `审批通过申请 ${requestId}，出库 ${outboundCount} 件 → ${request.project_location}`,
      created_at: now,
    });

    // 通知申请人审批结果 + 检查库存预警（必须 await，否则云函数提前终止导致通知丢失）
    try {
      await Promise.allSettled([
        notifyApprovalResult({
          db, applicantUsername: request.applicant, result: 'approved', items: request.items,
        }),
        checkAndNotifyStockAlert(db, Object.keys(stockDecrements)),
      ]);
      console.log('[notify] 审批通过通知 + 库存预警检查完成');
    } catch (e) {
      console.warn('[notify] 审批通知/库存预警失败:', e.message);
    }

    res.json({ code: 0, message: `审批通过，出库 ${outboundCount} 件` });
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function rejectRequest(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const db = getDB();

    const request = await db.collection('requests').findOne({ _id: id });
    if (!request) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 1, message: `申请当前状态为 ${request.status}，无法驳回` });
    }

    const now = new Date();
    const allSNs = request.items.flatMap(i => i.serial_numbers);
    if (allSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: allSNs } }, { $set: { reserved_request_id: '' } }
      );
    }

    await db.collection('requests').updateOne(
      { _id: id },
      { $set: { status: 'rejected', reject_reason: reason, approved_by: req.user.username, updated_at: now } }
    );
    await db.collection('counters').updateOne(
      { _id: 'stats' }, { $inc: { pending_requests: -1 }, $set: { updated_at: now } }
    );
    await db.collection('sys_logs').insertOne({
      category: 'Request', action_type: '驳回申请', operator: req.user.username,
      details: `驳回申请 ${id}，原因: ${reason}`, created_at: now,
    });

    // 通知申请人驳回结果（必须 await，否则云函数提前终止导致通知丢失）
    try {
      await notifyApprovalResult({
        db, applicantUsername: request.applicant, result: 'rejected', items: request.items, reason,
      });
      console.log('[notify] 驳回通知完成');
    } catch (e) {
      console.warn('[notify] 驳回通知失败:', e.message);
    }

    res.json({ code: 0, message: '申请已驳回' });
  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function cancelRequest(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();

    const request = await db.collection('requests').findOne({ _id: id });
    if (!request) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }
    if (request.applicant !== req.user.username) {
      return res.status(403).json({ code: 1, message: '只能撤回自己的申请' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 1, message: `申请当前状态为 ${request.status}，无法撤回` });
    }

    const now = new Date();
    const allSNs = request.items.flatMap(i => i.serial_numbers);
    if (allSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: allSNs } }, { $set: { reserved_request_id: '' } }
      );
    }

    await db.collection('requests').updateOne(
      { _id: id }, { $set: { status: 'cancelled', updated_at: now } }
    );
    await db.collection('counters').updateOne(
      { _id: 'stats' }, { $inc: { pending_requests: -1 }, $set: { updated_at: now } }
    );
    await db.collection('sys_logs').insertOne({
      category: 'Request', action_type: '撤回申请', operator: req.user.username,
      details: `撤回申请 ${id}`, created_at: now,
    });

    res.json({ code: 0, message: '申请已撤回' });
  } catch (err) {
    console.error('Cancel request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { createRequest, listRequests, getRequest, approveRequest, rejectRequest, cancelRequest };
