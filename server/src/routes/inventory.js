const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  listInventory,
  inbound,
  editInventory,
  scanBySN,
  batchImport,
} = require('../handlers/inventory');

const router = Router();

// All inventory routes require authentication
router.use(authenticate);

// List & scan: all authenticated users can read
router.get('/', validate(schemas.inventory.list, 'query'), listInventory);
router.get('/scan/:sn', scanBySN);

// Inbound, edit, batch-import: manager or admin
router.post('/inbound', requireRole('admin', 'manager'), validate(schemas.inventory.inbound), inbound);
router.patch('/:id', requireRole('admin', 'manager'), validate(schemas.inventory.edit), editInventory);
router.post('/batch-import', requireRole('admin', 'manager'), validate(schemas.inventory.batchImport), batchImport);

module.exports = router;
