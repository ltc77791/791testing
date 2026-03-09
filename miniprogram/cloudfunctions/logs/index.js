/**
 * 云函数：logs — 系统日志
 *
 * 支持的 action:
 *   GET /  — 日志分页查询
 */
const { handleRequest } = require('../_shared/cloud-handler');
const handlers = require('../../server/src/handlers/logs');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'GET /': handlers.listLogs,
  });
};
