/**
 * 云函数：requests — 出库申请/审批
 *
 * 支持的 action:
 *   POST /             — 提交出库申请
 *   GET /              — 申请列表
 *   GET /:id           — 申请详情
 *   POST /:id/approve  — 审批通过
 *   POST /:id/reject   — 驳回
 *   POST /:id/cancel   — 撤回
 */
const { handleRequest } = require('../_shared/cloud-handler');
const handlers = require('../../server/src/handlers/requests');

exports.main = async (event, context) => {
  return handleRequest(event, context, {
    'POST /':             handlers.createRequest,
    'GET /':              handlers.listRequests,
    'GET /:id':           handlers.getRequest,
    'POST /:id/approve':  handlers.approveRequest,
    'POST /:id/reject':   handlers.rejectRequest,
    'POST /:id/cancel':   handlers.cancelRequest,
  });
};
