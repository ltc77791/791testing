const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  listDictionaries,
  listOptions,
  createDictionary,
  updateDictionary,
  deleteDictionary,
} = require('../handlers/dictionaries');

const router = Router();

// List: admin/manager can manage dictionaries
router.get('/', authenticate, requireRole('admin', 'manager'), validate(schemas.dictionaries.list, 'query'), listDictionaries);

// Options: any authenticated user can fetch active options (for dropdowns)
router.get('/options', authenticate, validate(schemas.dictionaries.list, 'query'), listOptions);

// Create / Update / Delete: admin/manager only
router.post('/', authenticate, requireRole('admin', 'manager'), validate(schemas.dictionaries.create), createDictionary);
router.patch('/:id', authenticate, requireRole('admin', 'manager'), validate(schemas.dictionaries.update), updateDictionary);
router.delete('/:id', authenticate, requireRole('admin', 'manager'), deleteDictionary);

module.exports = router;
