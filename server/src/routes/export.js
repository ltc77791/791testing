const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { exportInventory, exportRequests, exportAnalytics } = require('../handlers/export');

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'manager'));

router.get('/inventory', exportInventory);
router.get('/requests', exportRequests);
router.get('/analytics', exportAnalytics);

module.exports = router;
