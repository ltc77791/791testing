const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { validate, schemas } = require('../utils/validate');
const { login, changePassword, logout } = require('../handlers/auth');

const router = Router();

// POST /api/auth/login — public
router.post('/login', validate(schemas.auth.login), login);

// POST /api/auth/change-password — requires login
router.post('/change-password', authenticate, validate(schemas.auth.changePassword), changePassword);

// POST /api/auth/logout — public (just clears cookie)
router.post('/logout', logout);

module.exports = router;
