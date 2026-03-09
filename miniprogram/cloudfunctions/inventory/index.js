/**
 * 云函数：inventory — 库存管理
 *
 * 支持的 action:
 *   GET /              — 库存列表 (分页+筛选)
 *   POST /inbound      — 单件入库
 *   PATCH /:id         — 编辑库存
 *   GET /scan/:sn      — 扫码查询
 *   POST /batch-import — 批量入库
 */
const { handleRequest } = require('./cloud-handler');
const handlers = require('./handlers');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'GET /':              handlers.listInventory,
    'POST /inbound':      handlers.inbound,
    'PATCH /:id':         handlers.editInventory,
    'GET /scan/:sn':      handlers.scanBySN,
    'POST /batch-import': handlers.batchImport,
  });
};
