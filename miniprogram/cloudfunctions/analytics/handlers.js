/**
 * Analytics handlers — 云函数版本
 * 从 server/src/handlers/analytics.js 适配
 */

const { getDB } = require('./db-adapter');

async function getKPI(req, res) {
  try {
    const db = getDB();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [inStock, outStock, pendingCount, monthIn, monthOut, lastMonthIn, lastMonthOut] =
      await Promise.all([
        db.collection('inventory').countDocuments({ status: 0 }),
        db.collection('inventory').countDocuments({ status: 1 }),
        db.collection('requests').countDocuments({ status: 'pending' }),
        db.collection('inventory').countDocuments({ inbound_time: { $gte: monthStart } }),
        db.collection('inventory').countDocuments({ status: 1, outbound_time: { $gte: monthStart } }),
        db.collection('inventory').countDocuments({ inbound_time: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
        db.collection('inventory').countDocuments({ status: 1, outbound_time: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
      ]);

    const netChange = monthIn - monthOut;
    const inDelta = monthIn - lastMonthIn;
    const outDelta = monthOut - lastMonthOut;

    res.json({
      code: 0,
      data: {
        in_stock: inStock, out_of_stock: outStock, pending_requests: pendingCount,
        month_inbound: monthIn, month_outbound: monthOut,
        last_month_inbound: lastMonthIn, last_month_outbound: lastMonthOut,
        net_change: netChange, in_delta: inDelta, out_delta: outDelta,
      },
    });
  } catch (err) {
    console.error('KPI error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getDistribution(req, res) {
  try {
    const db = getDB();
    const [byLocation, byPartType, byCondition] = await Promise.all([
      db.collection('inventory').aggregate([
        { $match: { status: 0 } },
        { $group: { _id: { subsidiary: '$subsidiary', warehouse: '$warehouse' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, subsidiary: '$_id.subsidiary', warehouse: '$_id.warehouse', count: 1 } },
      ]).toArray(),
      db.collection('inventory').aggregate([
        { $match: { status: 0 } },
        { $group: { _id: '$part_no', part_name: { $first: '$part_name' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, part_no: '$_id', part_name: 1, count: 1 } },
      ]).toArray(),
      db.collection('inventory').aggregate([
        { $match: { status: 0 } },
        { $group: { _id: { $ifNull: ['$condition', '未知'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, condition: '$_id', count: 1 } },
      ]).toArray(),
    ]);

    res.json({ code: 0, data: { by_location: byLocation, by_part_type: byPartType, by_condition: byCondition } });
  } catch (err) {
    console.error('Distribution error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getSafetyStock(req, res) {
  try {
    const db = getDB();
    const alerts = await db.collection('part_types').aggregate([
      { $match: { min_stock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'inventory',
          let: { pno: '$part_no' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$part_no', '$$pno'] }, { $eq: ['$status', 0] }] } } },
            { $count: 'count' },
          ],
          as: 'stock_info',
        },
      },
      { $addFields: { actual_stock: { $ifNull: [{ $arrayElemAt: ['$stock_info.count', 0] }, 0] } } },
      { $match: { $expr: { $lt: ['$actual_stock', '$min_stock'] } } },
      {
        $project: {
          _id: 0, part_no: 1, part_name: 1, min_stock: 1, actual_stock: 1,
          shortage: { $subtract: ['$min_stock', '$actual_stock'] },
        },
      },
      { $sort: { shortage: -1 } },
    ]).toArray();

    res.json({ code: 0, data: alerts });
  } catch (err) {
    console.error('Safety stock error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getTrend(req, res) {
  try {
    const db = getDB();
    const [inboundTrend, outboundTrend] = await Promise.all([
      db.collection('inventory').aggregate([
        { $match: { inbound_time: { $ne: null } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$inbound_time' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', inbound: '$count' } },
      ]).toArray(),
      db.collection('inventory').aggregate([
        { $match: { status: 1, outbound_time: { $ne: null } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$outbound_time' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', outbound: '$count' } },
      ]).toArray(),
    ]);

    const monthMap = {};
    for (const r of inboundTrend) monthMap[r.month] = { month: r.month, inbound: r.inbound, outbound: 0 };
    for (const r of outboundTrend) {
      if (monthMap[r.month]) monthMap[r.month].outbound = r.outbound;
      else monthMap[r.month] = { month: r.month, inbound: 0, outbound: r.outbound };
    }
    const trend = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({ code: 0, data: trend });
  } catch (err) {
    console.error('Trend error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getConsumption(req, res) {
  try {
    const db = getDB();
    const months = Number(req.query.months) || 6;
    const now = new Date();
    const matchStage = { status: 'approved' };
    if (months > 0) {
      const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
      matchStage.approved_at = { $gte: cutoff };
    }

    const [topParts, byProject] = await Promise.all([
      db.collection('requests').aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        { $group: { _id: '$items.part_no', part_name: { $first: '$items.part_name' }, total_qty: { $sum: '$items.quantity' } } },
        { $sort: { total_qty: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, part_no: '$_id', part_name: 1, total_qty: 1 } },
      ]).toArray(),
      db.collection('requests').aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        { $group: { _id: '$project_location', total_qty: { $sum: '$items.quantity' }, request_count: { $sum: 1 } } },
        { $sort: { total_qty: -1 } },
        { $project: { _id: 0, project_location: '$_id', total_qty: 1, request_count: 1 } },
      ]).toArray(),
    ]);

    res.json({ code: 0, data: { top_parts: topParts, by_project: byProject } });
  } catch (err) {
    console.error('Consumption error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getAge(req, res) {
  try {
    const db = getDB();
    const staleDays = Number(req.query.stale_days) || 90;
    const now = new Date();

    const ageBuckets = await db.collection('inventory').aggregate([
      { $match: { status: 0, inbound_time: { $ne: null } } },
      { $addFields: { age_days: { $dateDiff: { startDate: '$inbound_time', endDate: new Date(), unit: 'day' } } } },
      {
        $addFields: {
          age_bucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$age_days', 30] }, then: '0-30天' },
                { case: { $lte: ['$age_days', 90] }, then: '31-90天' },
                { case: { $lte: ['$age_days', 180] }, then: '91-180天' },
              ],
              default: '180天以上',
            },
          },
        },
      },
      { $group: { _id: '$age_bucket', count: { $sum: 1 } } },
      { $project: { _id: 0, bucket: '$_id', count: 1 } },
    ]).toArray();

    const bucketOrder = ['0-30天', '31-90天', '91-180天', '180天以上'];
    const bucketMap = {};
    for (const b of ageBuckets) bucketMap[b.bucket] = b.count;
    const distribution = bucketOrder.map(b => ({ bucket: b, count: bucketMap[b] || 0 }));

    const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
    const staleItems = await db.collection('inventory').aggregate([
      { $match: { status: 0, inbound_time: { $ne: null, $lte: staleThreshold } } },
      { $addFields: { age_days: { $dateDiff: { startDate: '$inbound_time', endDate: new Date(), unit: 'day' } } } },
      { $sort: { age_days: -1 } },
      { $limit: 100 },
      { $project: { _id: 0, part_no: 1, part_name: 1, serial_number: 1, subsidiary: 1, warehouse: 1, age_days: 1 } },
    ]).toArray();

    res.json({
      code: 0,
      data: { distribution, stale_count: staleItems.length, stale_days: staleDays, stale_items: staleItems },
    });
  } catch (err) {
    console.error('Age error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

async function getTurnover(req, res) {
  try {
    const db = getDB();
    const months = Number(req.query.months) || 6;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());

    const outbound = await db.collection('inventory').aggregate([
      { $match: { status: 1, outbound_time: { $gte: cutoff } } },
      { $group: { _id: '$part_no', out_qty: { $sum: 1 } } },
    ]).toArray();

    if (outbound.length === 0) return res.json({ code: 0, data: [] });

    const inStock = await db.collection('inventory').aggregate([
      { $match: { status: 0 } },
      { $group: { _id: '$part_no', in_qty: { $sum: 1 } } },
    ]).toArray();

    const inStockMap = {};
    for (const r of inStock) inStockMap[r._id] = r.in_qty;

    const partNos = outbound.map(r => r._id);
    const parts = await db.collection('part_types')
      .find({ part_no: { $in: partNos } })
      .project({ part_no: 1, part_name: 1 })
      .toArray();
    const nameMap = {};
    for (const p of parts) nameMap[p.part_no] = p.part_name;

    const result = outbound.map(r => {
      const inQty = inStockMap[r._id] || 0;
      return {
        part_no: r._id, part_name: nameMap[r._id] || '',
        out_qty: r.out_qty, in_qty: inQty,
        turnover_rate: inQty > 0 ? Math.round((r.out_qty / inQty) * 100) / 100 : null,
      };
    }).sort((a, b) => (b.turnover_rate ?? Infinity) - (a.turnover_rate ?? Infinity));

    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('Turnover error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { getKPI, getDistribution, getSafetyStock, getTrend, getConsumption, getAge, getTurnover };
