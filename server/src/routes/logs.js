const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { getLogs } = require('../handlers/logs');

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'manager'));

router.get('/', getLogs);

module.exports = router;
