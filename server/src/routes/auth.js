const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { validate, schemas } = require('../utils/validate');
const { login, changePassword } = require('../handlers/auth');

const router = Router();

// POST /api/auth/login — public
router.post('/login', validate(schemas.auth.login), login);

// POST /api/auth/change-password — requires login
router.post('/change-password', authenticate, validate(schemas.auth.changePassword), changePassword);

module.exports = router;
