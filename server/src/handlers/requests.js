const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const { notifyRequestSubmitted, notifyApprovalResult, checkAndNotifyStockAlert } = require('../utils/subscribe-message');

/**
 * POST /api/requests
 * Body: { items: [{ part_no, quantity }], project_location, remark? }
 * 申请人提交出库申请，系统自动预留库存（锁定 inventory 记录）。
 */
async function createRequest(req, res) {
  try {
    const { items, project_location, project_no, outbound_reason, remark } = req.body;

    const db = getDB();
    const now = new Date();

    // Validate each item and reserve inventory
    const reservedSNs = []; // track for rollback on error
    const requestItems = [];

    for (const item of items) {
      if (!item.part_no || !item.quantity || item.quantity < 1) {
        // Rollback any reservations made so far
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } },
            { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({ code: 1, message: `无效的申请项: ${JSON.stringify(item)}` });
      }

      const partType = await db.collection('part_types').findOne({ part_no: item.part_no });
      if (!partType) {
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } },
            { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({ code: 1, message: `备件类型 ${item.part_no} 不存在` });
      }

      // Find available inventory (status=0, not reserved)
      const available = await db.collection('inventory')
        .find({ part_no: item.part_no, status: 0, reserved_request_id: '' })
        .limit(item.quantity)
        .toArray();

      if (available.length < item.quantity) {
        if (reservedSNs.length > 0) {
          await db.collection('inventory').updateMany(
            { serial_number: { $in: reservedSNs } },
            { $set: { reserved_request_id: '' } }
          );
        }
        return res.status(400).json({
          code: 1,
          message: `${item.part_no} 库存不足，需要 ${item.quantity}，可用 ${available.length}`,
        });
      }

      const sns = available.map(r => r.serial_number);
      reservedSNs.push(...sns);

      requestItems.push({
        part_no: item.part_no,
        part_name: partType.part_name,
        value_type: partType.value_type || '高价值',
        quantity: item.quantity,
        serial_numbers: sns,
      });
    }

    // Validate outbound_reason
    const validReasons = ['维修', '调用', '销售'];
    if (!outbound_reason || !validReasons.includes(outbound_reason)) {
      // Rollback any reservations
      if (reservedSNs.length > 0) {
        await db.collection('inventory').updateMany(
          { serial_number: { $in: reservedSNs } },
          { $set: { reserved_request_id: '' } }
        );
      }
      return res.status(400).json({ code: 1, message: '出库原因必须为: 维修, 调用, 销售' });
    }

    // Create the request document
    const requestDoc = {
      applicant: req.user.username,
      status: 'pending', // pending | approved | rejected | cancelled
      items: requestItems,
      project_location,
      project_no,
      outbound_reason,
      remark: remark || '',
      created_at: now,
      updated_at: now,
      approved_by: null,
      approved_at: null,
      reject_reason: null,
    };

    const result = await db.collection('requests').insertOne(requestDoc);
    const requestId = result.insertedId.toString();

    // Reserve the inventory records
    await db.collection('inventory').updateMany(
      { serial_number: { $in: reservedSNs } },
      { $set: { reserved_request_id: requestId } }
    );

    // Update counters
    await db.collection('counters').updateOne(
      { _id: 'stats' },
      { $inc: { pending_requests: 1 }, $set: { updated_at: now } }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Request',
      action_type: '提交申请',
      operator: req.user.username,
      details: `申请出库: ${requestItems.map(i => `${i.part_no}×${i.quantity}`).join(', ')} → ${project_location}`,
      created_at: now,
    });

    res.status(201).json({ code: 0, message: '申请提交成功', data: { _id: requestId, ...requestDoc } });

    // 异步发送订阅消息通知管理员（不阻塞响应）
    notifyRequestSubmitted({
      applicant: req.user.username,
      items: requestItems,
      projectLocation: project_location,
    }).catch(err => console.warn('通知发送失败:', err.message));
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/requests
 * Query: ?status=pending|approved|rejected|cancelled&applicant=&page=1&pageSize=20
 */
async function listRequests(req, res) {
  try {
    const db = getDB();
    const { status, applicant, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (applicant) filter.applicant = applicant;

    // Non-admin/manager users can only see their own requests
    const userRoles = req.user.roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('manager')) {
      filter.applicant = req.user.username;
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);

    const [items, total] = await Promise.all([
      db.collection('requests')
        .find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('requests').countDocuments(filter),
    ]);

    res.json({ code: 0, data: { items, total, page: Number(page), pageSize: limit } });
  } catch (err) {
    console.error('List requests error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/requests/:id
 */
async function getRequest(req, res) {
  try {
    const { id } = req.params;
    let oid;
    try { oid = new ObjectId(id); } catch {
      return res.status(400).json({ code: 1, message: '无效的申请ID' });
    }

    const db = getDB();
    const doc = await db.collection('requests').findOne({ _id: oid });
    if (!doc) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }

    // Non-admin/manager can only view own requests
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

/**
 * POST /api/requests/:id/approve
 * Body: { partial_items?: [{ part_no, quantity }] }
 * 审批通过：将预留的 inventory 标记出库，扣减库存计数。
 * 支持部分批准（partial_items 明确指定要出库的序列号数组）。
 */
async function approveRequest(req, res) {
  try {
    const { id } = req.params;
    const { partial_items } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch {
      return res.status(400).json({ code: 1, message: '无效的申请ID' });
    }

    const db = getDB();
    const request = await db.collection('requests').findOne({ _id: oid });

    if (!request) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 1, message: `申请当前状态为 ${request.status}，无法审批` });
    }

    const now = new Date();
    const requestId = oid.toString();

    // Determine which SNs to approve
    let approvedSNs = [];
    let releasedSNs = [];
    let outboundCount = 0;
    const stockDecrements = {};

    if (partial_items && Array.isArray(partial_items)) {
      // Partial/Specific approval: approving specific serial numbers chosen by approver
      for (const pi of partial_items) {
        const reqItem = request.items.find(i => i.part_no === pi.part_no);
        if (!reqItem) continue;

        const isLowValue = (reqItem.value_type === '低价值');

        if (isLowValue && pi.quantity && !pi.serial_numbers) {
          // 低价值备件：按数量审批，从预留的SN中取前N个
          const approveCount = Math.min(pi.quantity, reqItem.serial_numbers.length);
          const validApproved = reqItem.serial_numbers.slice(0, approveCount);
          const validReleased = reqItem.serial_numbers.slice(approveCount);

          approvedSNs.push(...validApproved);
          releasedSNs.push(...validReleased);
          outboundCount += validApproved.length;
          if (validApproved.length > 0) {
            stockDecrements[pi.part_no] = (stockDecrements[pi.part_no] || 0) + validApproved.length;
          }
        } else {
          // 高价值备件：按序列号审批
          const requestedSNs = new Set(pi.serial_numbers || []);
          const validApproved = [];
          const validReleased = [];

          for (const sn of reqItem.serial_numbers) {
            if (requestedSNs.has(sn)) {
              validApproved.push(sn);
            } else {
              validReleased.push(sn);
            }
          }

          approvedSNs.push(...validApproved);
          releasedSNs.push(...validReleased);
          outboundCount += validApproved.length;
          if (validApproved.length > 0) {
            stockDecrements[pi.part_no] = (stockDecrements[pi.part_no] || 0) + validApproved.length;
          }
        }
      }

      // Release SNs for items not mentioned in partial_items at all
      for (const reqItem of request.items) {
        if (!partial_items.find(pi => pi.part_no === reqItem.part_no)) {
          releasedSNs.push(...reqItem.serial_numbers);
        }
      }
    } else {
      // Full approval
      for (const reqItem of request.items) {
        approvedSNs.push(...reqItem.serial_numbers);
        outboundCount += reqItem.serial_numbers.length;
        stockDecrements[reqItem.part_no] = (stockDecrements[reqItem.part_no] || 0) + reqItem.serial_numbers.length;
      }
    }

    // Mark approved inventory as outbound (status=1)
    if (approvedSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: approvedSNs } },
        {
          $set: {
            status: 1,
            outbound_time: now,
            receiver: request.applicant,
            approver: req.user.username,
            project_location: request.project_location,
          },
        }
      );
    }

    // Release unapproved inventory reservations
    if (releasedSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: releasedSNs } },
        { $set: { reserved_request_id: '' } }
      );
    }

    // Build approved_items detail for storage
    const approvedSet = new Set(approvedSNs);
    const approvedItemsResult = request.items.map(reqItem => {
      const approvedForItem = reqItem.serial_numbers.filter(sn => approvedSet.has(sn));
      return {
        part_no: reqItem.part_no,
        part_name: reqItem.part_name,
        value_type: reqItem.value_type || '高价值',
        quantity: reqItem.quantity,
        serial_numbers: reqItem.serial_numbers,
        approved_quantity: approvedForItem.length,
        approved_serial_numbers: approvedForItem,
      };
    });
    const isPartial = approvedItemsResult.some(i => i.approved_quantity < i.quantity);

    // Update part_types current_stock
    const stockUpdates = Object.entries(stockDecrements).map(([pno, dec]) =>
      db.collection('part_types').updateOne(
        { part_no: pno },
        { $inc: { current_stock: -dec }, $set: { updated_at: now } }
      )
    );
    await Promise.all(stockUpdates);

    // Update counters
    await db.collection('counters').updateOne(
      { _id: 'stats' },
      {
        $inc: {
          pending_requests: -1,
          total_in_stock: -outboundCount,
          total_out_of_stock: outboundCount,
          month_outbound: outboundCount,
        },
        $set: { updated_at: now },
      }
    );

    // Update request status
    await db.collection('requests').updateOne(
      { _id: oid },
      {
        $set: {
          status: 'approved',
          approval_type: isPartial ? 'partial' : 'full',
          approved_items: approvedItemsResult,
          approved_by: req.user.username,
          approved_at: now,
          updated_at: now,
        },
      }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Request',
      action_type: '审批通过',
      operator: req.user.username,
      details: `审批通过申请 ${requestId}，出库 ${outboundCount} 件 → ${request.project_location}`,
      created_at: now,
    });

    res.json({ code: 0, message: `审批通过，出库 ${outboundCount} 件` });

    // 异步通知申请人 + 检查库存预警
    notifyApprovalResult({
      applicantUsername: request.applicant,
      result: 'approved',
      items: request.items,
    }).catch(err => console.warn('通知发送失败:', err.message));
    checkAndNotifyStockAlert(Object.keys(stockDecrements))
      .catch(err => console.warn('库存预警检查失败:', err.message));
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/requests/:id/reject
 * Body: { reason }
 */
async function rejectRequest(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch {
      return res.status(400).json({ code: 1, message: '无效的申请ID' });
    }

    const db = getDB();
    const request = await db.collection('requests').findOne({ _id: oid });

    if (!request) {
      return res.status(404).json({ code: 1, message: '申请不存在' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 1, message: `申请当前状态为 ${request.status}，无法驳回` });
    }

    const now = new Date();

    // Release all reserved inventory
    const allSNs = request.items.flatMap(i => i.serial_numbers);
    if (allSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: allSNs } },
        { $set: { reserved_request_id: '' } }
      );
    }

    // Update request
    await db.collection('requests').updateOne(
      { _id: oid },
      {
        $set: {
          status: 'rejected',
          reject_reason: reason,
          approved_by: req.user.username,
          updated_at: now,
        },
      }
    );

    // Update counters
    await db.collection('counters').updateOne(
      { _id: 'stats' },
      { $inc: { pending_requests: -1 }, $set: { updated_at: now } }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Request',
      action_type: '驳回申请',
      operator: req.user.username,
      details: `驳回申请 ${id}，原因: ${reason}`,
      created_at: now,
    });

    res.json({ code: 0, message: '申请已驳回' });

    // 异步通知申请人
    notifyApprovalResult({
      applicantUsername: request.applicant,
      result: 'rejected',
      items: request.items,
      reason,
    }).catch(err => console.warn('通知发送失败:', err.message));
  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * POST /api/requests/:id/cancel
 * 申请人自己撤回（仅 pending 状态可撤）
 */
async function cancelRequest(req, res) {
  try {
    const { id } = req.params;

    let oid;
    try { oid = new ObjectId(id); } catch {
      return res.status(400).json({ code: 1, message: '无效的申请ID' });
    }

    const db = getDB();
    const request = await db.collection('requests').findOne({ _id: oid });

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

    // Release all reserved inventory
    const allSNs = request.items.flatMap(i => i.serial_numbers);
    if (allSNs.length > 0) {
      await db.collection('inventory').updateMany(
        { serial_number: { $in: allSNs } },
        { $set: { reserved_request_id: '' } }
      );
    }

    // Update request
    await db.collection('requests').updateOne(
      { _id: oid },
      { $set: { status: 'cancelled', updated_at: now } }
    );

    // Update counters
    await db.collection('counters').updateOne(
      { _id: 'stats' },
      { $inc: { pending_requests: -1 }, $set: { updated_at: now } }
    );

    // Log
    await db.collection('sys_logs').insertOne({
      category: 'Request',
      action_type: '撤回申请',
      operator: req.user.username,
      details: `撤回申请 ${id}`,
      created_at: now,
    });

    res.json({ code: 0, message: '申请已撤回' });
  } catch (err) {
    console.error('Cancel request error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { createRequest, listRequests, getRequest, approveRequest, rejectRequest, cancelRequest };
