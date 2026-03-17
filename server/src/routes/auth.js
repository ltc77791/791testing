const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { validate, schemas } = require('../utils/validate');
const { login, changePassword, logout, wxLogin, wxBind, wxUnbind } = require('../handlers/auth');

const router = Router();

// POST /api/auth/login — public (PC 端)
router.post('/login', validate(schemas.auth.login), login);

// POST /api/auth/change-password — requires login
router.post('/change-password', authenticate, validate(schemas.auth.changePassword), changePassword);

// POST /api/auth/logout — public (just clears cookie)
router.post('/logout', logout);

// POST /api/auth/wx-login — public (小程序微信登录)
router.post('/wx-login', wxLogin);

// POST /api/auth/wx-bind — public (小程序绑定账号)
router.post('/wx-bind', wxBind);

// POST /api/auth/wx-unbind — requires login (解绑微信)
router.post('/wx-unbind', authenticate, wxUnbind);

module.exports = router;
