const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const { listUsers, createUser, updateUser, deleteUser } = require('../handlers/users');

const router = Router();

// All user management routes require admin role
router.use(authenticate, requireRole('admin'));

router.get('/', listUsers);
router.post('/', validate(schemas.users.create), createUser);
router.patch('/:username', validate(schemas.users.update), updateUser);
router.delete('/:username', deleteUser);

module.exports = router;
