const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header, verifies it,
 * and attaches decoded user info to req.user.
 */
function authenticate(req, res, next) {
  // Support extracting token from HttpOnly Cookie or conventional Authorization header
  let token = req.cookies?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ code: 1, message: '未登录或 token 缺失' });
  }
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
