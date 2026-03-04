const { getDB } = require('../db');

/**
 * Convert array of objects to CSV string
 */
function toCsv(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';

  const header = columns.join(',');
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val == null) return '';
      const str = String(val);
      // Escape fields containing comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  );

  return header + '\n' + lines.join('\n') + '\n';
}

/**
 * GET /api/export/inventory
 * 导出在库库存明细 CSV
 */
async function exportInventory(req, res) {
  try {
    const db = getDB();

    const items = await db.collection('inventory')
      .find({ status: 0 })
      .sort({ part_no: 1, serial_number: 1 })
      .project({
        _id: 0,
        part_no: 1,
        part_name: 1,
        serial_number: 1,
        condition: 1,
        subsidiary: 1,
        warehouse: 1,
        inbound_time: 1,
        inbound_operator: 1,
      })
      .toArray();

    // Format dates
    const rows = items.map(r => ({
      ...r,
      inbound_time: r.inbound_time ? new Date(r.inbound_time).toISOString().slice(0, 19).replace('T', ' ') : '',
    }));

    const columns = ['part_no', 'part_name', 'serial_number', 'condition', 'subsidiary', 'warehouse', 'inbound_time', 'inbound_operator'];
    const csv = toCsv(rows, columns);

    // Add UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_export.csv"');
    res.send(bom + csv);
  } catch (err) {
    console.error('Export inventory error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/export/requests
 * 导出申请/出库记录 CSV
 */
async function exportRequests(req, res) {
  try {
    const db = getDB();

    const items = await db.collection('requests')
      .find({})
      .sort({ created_at: -1 })
      .project({
        _id: 1,
        part_no: 1,
        part_name: 1,
        qty: 1,
        approved_qty: 1,
        approved_sns: 1,
        status: 1,
        project_location: 1,
        applicant: 1,
        approver: 1,
        reject_reason: 1,
        created_at: 1,
        approved_at: 1,
      })
      .toArray();

    const rows = items.map(r => ({
      id: r._id,
      part_no: r.part_no || '',
      part_name: r.part_name || '',
      qty: r.qty || 0,
      approved_qty: r.approved_qty || 0,
      approved_sns: Array.isArray(r.approved_sns) ? r.approved_sns.join(';') : '',
      status: r.status || '',
      project_location: r.project_location || '',
      applicant: r.applicant || '',
      approver: r.approver || '',
      reject_reason: r.reject_reason || '',
      created_at: r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : '',
      approved_at: r.approved_at ? new Date(r.approved_at).toISOString().slice(0, 19).replace('T', ' ') : '',
    }));

    const columns = ['id', 'part_no', 'part_name', 'qty', 'approved_qty', 'approved_sns', 'status', 'project_location', 'applicant', 'approver', 'reject_reason', 'created_at', 'approved_at'];
    const csv = toCsv(rows, columns);

    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="requests_export.csv"');
    res.send(bom + csv);
  } catch (err) {
    console.error('Export requests error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

/**
 * GET /api/export/analytics
 * 导出分析报告 CSV (趋势 + 库龄)
 */
async function exportAnalytics(req, res) {
  try {
    const db = getDB();
    const now = new Date();

    // Sheet 1: Monthly trend
    const [inboundTrend, outboundTrend] = await Promise.all([
      db.collection('inventory').aggregate([
        { $match: { inbound_time: { $ne: null } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$inbound_time' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      db.collection('inventory').aggregate([
        { $match: { status: 1, outbound_time: { $ne: null } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$outbound_time' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    const monthMap = {};
    for (const r of inboundTrend) monthMap[r._id] = { month: r._id, inbound: r.count, outbound: 0 };
    for (const r of outboundTrend) {
      if (monthMap[r._id]) monthMap[r._id].outbound = r.count;
      else monthMap[r._id] = { month: r._id, inbound: 0, outbound: r.count };
    }
    const trendRows = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    // Sheet 2: Age detail for in-stock items
    const ageItems = await db.collection('inventory').aggregate([
      { $match: { status: 0, inbound_time: { $ne: null } } },
      { $addFields: { age_days: { $dateDiff: { startDate: '$inbound_time', endDate: now, unit: 'day' } } } },
      { $sort: { age_days: -1 } },
      { $project: { _id: 0, part_no: 1, part_name: 1, serial_number: 1, subsidiary: 1, warehouse: 1, inbound_time: 1, age_days: 1 } },
    ]).toArray();

    const ageRows = ageItems.map(r => ({
      ...r,
      inbound_time: r.inbound_time ? new Date(r.inbound_time).toISOString().slice(0, 19).replace('T', ' ') : '',
      age_bucket: r.age_days <= 30 ? '0-30天' : r.age_days <= 90 ? '31-90天' : r.age_days <= 180 ? '91-180天' : '180天以上',
    }));

    // Combine into one CSV with section headers
    let csv = '\uFEFF';
    csv += '=== 月度出入库趋势 ===\n';
    csv += toCsv(trendRows, ['month', 'inbound', 'outbound']);
    csv += '\n=== 库龄明细 ===\n';
    csv += toCsv(ageRows, ['part_no', 'part_name', 'serial_number', 'subsidiary', 'warehouse', 'inbound_time', 'age_days', 'age_bucket']);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export analytics error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { exportInventory, exportRequests, exportAnalytics };
