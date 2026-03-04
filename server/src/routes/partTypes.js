const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const {
  listPartTypes,
  createPartType,
  updatePartType,
  deletePartType,
} = require('../handlers/partTypes');

const router = Router();

// All part-type routes require manager or admin role
router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', listPartTypes);
router.post('/', createPartType);
router.patch('/:part_no', updatePartType);
router.delete('/:part_no', deletePartType);

module.exports = router;
