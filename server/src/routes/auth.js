const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { login, changePassword } = require('../handlers/auth');

const router = Router();

// POST /api/auth/login — public
router.post('/login', login);

// POST /api/auth/change-password — requires login
router.post('/change-password', authenticate, changePassword);

module.exports = router;
