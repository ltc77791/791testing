const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  listPartTypes,
  createPartType,
  updatePartType,
  deletePartType,
  batchImportPartTypes,
} = require('../handlers/partTypes');

const router = Router();

// List: any authenticated user can read part types (needed for request form)
router.get('/', authenticate, validate(schemas.partTypes.list, 'query'), listPartTypes);

// Create / Update / Delete / BatchImport: admin or manager only
router.post('/', authenticate, requireRole('admin', 'manager'), validate(schemas.partTypes.create), createPartType);
router.post('/batch-import', authenticate, requireRole('admin', 'manager'), validate(schemas.partTypes.batchImport), batchImportPartTypes);
router.patch('/:part_no', authenticate, requireRole('admin', 'manager'), validate(schemas.partTypes.update), updatePartType);
router.delete('/:part_no', authenticate, requireRole('admin', 'manager'), deletePartType);

module.exports = router;
