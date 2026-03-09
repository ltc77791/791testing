/**
 * 云函数：analytics — 数据分析
 *
 * 支持的 action:
 *   GET /kpi            — KPI 指标
 *   GET /distribution   — 库存分布
 *   GET /safety-stock   — 安全库存预警
 *   GET /trend          — 出入库趋势
 *   GET /consumption    — 消耗排行
 *   GET /age            — 库龄分析
 *   GET /turnover       — 周转率
 */
const { handleRequest } = require('../_shared/cloud-handler');
const handlers = require('../../server/src/handlers/analytics');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'GET /kpi':          handlers.getKPI,
    'GET /distribution': handlers.getDistribution,
    'GET /safety-stock': handlers.getSafetyStock,
    'GET /trend':        handlers.getTrend,
    'GET /consumption':  handlers.getConsumption,
    'GET /age':          handlers.getAge,
    'GET /turnover':     handlers.getTurnover,
  });
};
