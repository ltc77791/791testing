const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  createRequest,
  listRequests,
  getRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
} = require('../handlers/requests');

const router = Router();

// All routes require authentication
router.use(authenticate);

// Only user role can create requests (admin/manager are approvers, not applicants)
router.post('/', requireRole('operator'), validate(schemas.requests.create), createRequest);
router.get('/', validate(schemas.requests.list, 'query'), listRequests);
router.get('/:id', getRequest);

// Only the applicant can cancel their own request
router.post('/:id/cancel', cancelRequest);

// Approve / reject: admin or manager only
router.post('/:id/approve', requireRole('admin', 'manager'), validate(schemas.requests.approve), approveRequest);
router.post('/:id/reject', requireRole('admin', 'manager'), validate(schemas.requests.reject), rejectRequest);

module.exports = router;
