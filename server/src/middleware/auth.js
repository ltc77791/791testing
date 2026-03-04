const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header, verifies it,
 * and attaches decoded user info to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1, message: '未登录或 token 缺失' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded; // { username, roles, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 1, message: 'token 已过期，请重新登录' });
    }
    return res.status(401).json({ code: 1, message: 'token 无效' });
  }
}

module.exports = authenticate;
