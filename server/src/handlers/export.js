const { getDB } = require('../db');

/**
 * Convert array of objects to CSV string.
 * columns: array of { key, label } or plain strings (used as both key and label).
 */
function toCsv(rows, columns) {
  const cols = columns.map(c => (typeof c === 'string' ? { key: c, label: c } : c));
  const header = cols.map(c => escapeCsvField(c.label)).join(',');

  if (!rows.length) return header + '\n';

  const lines = rows.map(row =>
    cols.map(col => escapeCsvField(row[col.key])).join(',')
  );

  return header + '\n' + lines.join('\n') + '\n';
}

function escapeCsvField(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * GET /api/export/inventory
 * 导出库存明细 CSV — 支持筛选参数，列与库存管理页面一致
 * Query: ?part_no=&subsidiary=&status=0|1&keyword=
 */
async function exportInventory(req, res) {
  try {
    const db = getDB();
    const { part_no, subsidiary, status, contract_no, keyword } = req.query;

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

    const items = await db.collection('inventory')
      .find(filter)
      .sort({ inbound_time: -1 })
      .toArray();

    function fmtDate(d) {
      if (!d) return '';
      return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    }

    const rows = items.map(r => ({
      serial_number: r.serial_number || '',
      part_no: r.part_no || '',
      part_name: r.part_name || '',
      subsidiary: r.subsidiary || '',
      warehouse: r.warehouse || '',
      condition: r.condition || '',
      contract_no: r.contract_no || '',
      status: r.status === 0 ? '在库' : '已出库',
      inbound_time: fmtDate(r.inbound_time),
      inbound_operator: r.inbound_operator || '',
      outbound_time: fmtDate(r.outbound_time),
      receiver: r.receiver || '',
      project_location: r.project_location || '',
    }));

    const columns = [
      { key: 'serial_number', label: '序列号' },
      { key: 'part_no', label: '备件编号' },
      { key: 'part_name', label: '备件名称' },
      { key: 'subsidiary', label: '子公司' },
      { key: 'warehouse', label: '仓库' },
      { key: 'condition', label: '成色' },
      { key: 'contract_no', label: '采购合同号' },
      { key: 'status', label: '状态' },
      { key: 'inbound_time', label: '入库时间' },
      { key: 'inbound_operator', label: '入库人' },
      { key: 'outbound_time', label: '出库时间' },
      { key: 'receiver', label: '领用人' },
      { key: 'project_location', label: '项目/用途' },
    ];
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
 * 导出申请/审批记录 CSV — 按物料行展开，与审批管理页面12列一致
 */
async function exportRequests(req, res) {
  try {
    const db = getDB();

    const requests = await db.collection('requests')
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    function approvalResultText(request, itemIndex) {
      if (request.status === 'rejected') return '已驳回';
      if (request.status === 'cancelled') return '已撤回';
      if (request.status === 'pending') return '待审批';
      // approved
      if (request.approval_type === 'partial') return '部分通过';
      return '全量通过';
    }

    function formatDate(d) {
      if (!d) return '';
      return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    }

    // Flatten: one row per item in each request
    const rows = [];
    for (const r of requests) {
      const sourceItems = r.approved_items || r.items || [];
      for (let i = 0; i < sourceItems.length; i++) {
        const item = sourceItems[i];
        const sns = item.serial_numbers || [];
        const approvedQty = item.approved_quantity != null
          ? item.approved_quantity
          : (r.status === 'approved' ? item.quantity : 0);

        rows.push({
          created_at: formatDate(r.created_at),
          project_no: r.project_no || r.project_location || '',
          applicant: r.applicant || '',
          outbound_reason: r.outbound_reason || r.remark || '',
          part_no: item.part_no || '',
          part_name: item.part_name || '',
          serial_numbers: sns.join('; '),
          quantity: item.quantity || 0,
          approved_at: formatDate(r.approved_at),
          approved_by: r.approved_by || '',
          approval_result: approvalResultText(r, i),
          approved_quantity: approvedQty,
        });
      }
    }

    const columns = [
      { key: 'created_at', label: '申请时间' },
      { key: 'project_no', label: '项目号' },
      { key: 'applicant', label: '申请人' },
      { key: 'outbound_reason', label: '出库原因' },
      { key: 'part_no', label: '备件编号' },
      { key: 'part_name', label: '备件名称' },
      { key: 'serial_numbers', label: '序列号' },
      { key: 'quantity', label: '申请数量' },
      { key: 'approved_at', label: '审批时间' },
      { key: 'approved_by', label: '审批人' },
      { key: 'approval_result', label: '审批结果' },
      { key: 'approved_quantity', label: '审批数量' },
    ];
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
    csv += toCsv(trendRows, [
      { key: 'month', label: '月份' },
      { key: 'inbound', label: '入库数量' },
      { key: 'outbound', label: '出库数量' },
    ]);
    csv += '\n=== 库龄明细 ===\n';
    csv += toCsv(ageRows, [
      { key: 'part_no', label: '备件编号' },
      { key: 'part_name', label: '备件名称' },
      { key: 'serial_number', label: '序列号' },
      { key: 'subsidiary', label: '子公司' },
      { key: 'warehouse', label: '仓库' },
      { key: 'inbound_time', label: '入库时间' },
      { key: 'age_days', label: '库龄(天)' },
      { key: 'age_bucket', label: '库龄分组' },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export analytics error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { exportInventory, exportRequests, exportAnalytics };
