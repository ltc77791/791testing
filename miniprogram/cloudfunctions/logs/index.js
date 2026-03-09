/**
 * 云函数：logs — 系统日志
 *
 * 支持的 action:
 *   GET /  — 日志分页查询
 */
const { handleRequest } = require('./cloud-handler');
const handlers = require('./handlers');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'GET /': handlers.listLogs,
  });
};
