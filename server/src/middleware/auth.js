const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDB } = require('../db');

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header, verifies it,
 * and attaches decoded user info to req.user.
 * Also validates token_version to support immediate revocation on password change/deactivation.
 */
async function authenticate(req, res, next) {
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

    // Verify token_version against database to support immediate revocation
    const db = getDB();
    const user = await db.collection('users').findOne(
      { username: decoded.username },
      { projection: { token_version: 1, is_active: 1 } }
    );

    if (!user || !user.is_active) {
      return res.status(401).json({ code: 1, message: '账号已被停用或不存在' });
    }

    // Reject tokens issued before token_version was introduced (no tv field),
    // or tokens whose version doesn't match the current user version
    if (user.token_version !== undefined) {
      if (decoded.tv === undefined || decoded.tv !== user.token_version) {
        return res.status(401).json({ code: 1, message: '令牌已失效，请重新登录' });
      }
    }

    req.user = decoded; // { username, roles, tv, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 1, message: 'token 已过期，请重新登录' });
    }
    return res.status(401).json({ code: 1, message: 'token 无效' });
  }
}

module.exports = authenticate;
