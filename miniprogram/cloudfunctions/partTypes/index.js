/**
 * 云函数：partTypes — 备件类型管理
 *
 * 支持的 action:
 *   GET /              — 备件类型列表
 *   POST /             — 创建备件类型
 *   PATCH /:part_no    — 编辑备件类型
 *   DELETE /:part_no   — 删除备件类型
 */
const { handleRequest } = require('./cloud-handler');
const handlers = require('./handlers');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'GET /':             handlers.listPartTypes,
    'POST /':            handlers.createPartType,
    'PATCH /:part_no':   handlers.updatePartType,
    'DELETE /:part_no':  handlers.deletePartType,
  });
};
