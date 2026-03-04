const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
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

// Any authenticated user can create a request, list their own, view detail
router.post('/', createRequest);
router.get('/', listRequests);
router.get('/:id', getRequest);

// Only the applicant can cancel their own request
router.post('/:id/cancel', cancelRequest);

// Approve / reject: admin or manager only
router.post('/:id/approve', requireRole('admin', 'manager'), approveRequest);
router.post('/:id/reject', requireRole('admin', 'manager'), rejectRequest);

module.exports = router;
