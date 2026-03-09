/**
 * Logs handlers — 云函数版本
 * 从 server/src/handlers/logs.js 适配
 */

const { getDB } = require('./db-adapter');

async function listLogs(req, res) {
  try {
    const db = getDB();
    const { category, operator, start_date, end_date, page = 1, page_size = 20 } = req.query;

    const filter = {};

    if (category) {
      const cats = category.split(',').map(s => s.trim()).filter(Boolean);
      if (cats.length === 1) filter.category = cats[0];
      else if (cats.length > 1) filter.category = { $in: cats };
    }

    if (operator) {
      const ops = operator.split(',').map(s => s.trim()).filter(Boolean);
      if (ops.length === 1) filter.operator = ops[0];
      else if (ops.length > 1) filter.operator = { $in: ops };
    }

    if (start_date || end_date) {
      filter.created_at = {};
      if (start_date) filter.created_at.$gte = new Date(start_date);
      if (end_date) {
        const endDate = new Date(end_date);
        endDate.setHours(23, 59, 59, 999);
        filter.created_at.$lte = endDate;
      }
    }

    const pageNum = Math.max(1, Number(page));
    const limit = Math.min(100, Math.max(1, Number(page_size)));
    const skip = (pageNum - 1) * limit;

    const [total, items] = await Promise.all([
      db.collection('sys_logs').countDocuments(filter),
      db.collection('sys_logs').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
    ]);

    res.json({
      code: 0,
      data: { items, total, page: pageNum, page_size: limit, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Logs error:', err);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
}

module.exports = { listLogs };
