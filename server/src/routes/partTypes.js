const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  listPartTypes,
  createPartType,
  updatePartType,
  deletePartType,
} = require('../handlers/partTypes');

const router = Router();

// All part-type routes require manager or admin role
router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', validate(schemas.partTypes.list, 'query'), listPartTypes);
router.post('/', validate(schemas.partTypes.create), createPartType);
router.patch('/:part_no', validate(schemas.partTypes.update), updatePartType);
router.delete('/:part_no', deletePartType);

module.exports = router;
