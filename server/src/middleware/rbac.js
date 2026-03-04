/**
 * Role-based access control middleware.
 * Usage: requireRole('admin') or requireRole('admin', 'manager')
 *
 * Must be used AFTER authenticate middleware.
 * Checks if req.user.roles includes at least one of the allowed roles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 1, message: '未登录' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        code: 1,
        message: `权限不足，需要角色: ${allowedRoles.join(' 或 ')}`,
      });
    }

    next();
  };
}

module.exports = requireRole;
