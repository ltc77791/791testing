const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const { getLogs } = require('../handlers/logs');

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'manager'));

router.get('/', validate(schemas.logs.list, 'query'), getLogs);

module.exports = router;
