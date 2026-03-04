const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
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
router.get('/', listInventory);
router.get('/scan/:sn', scanBySN);

// Inbound, edit, batch-import: manager or admin
router.post('/inbound', requireRole('admin', 'manager'), inbound);
router.patch('/:id', requireRole('admin', 'manager'), editInventory);
router.post('/batch-import', requireRole('admin', 'manager'), batchImport);

module.exports = router;
