const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { validate, schemas } = require('../utils/validate');
const {
  getKPI,
  getDistribution,
  getSafetyStock,
  getTrend,
  getConsumption,
  getAge,
  getTurnover,
} = require('../handlers/analytics');

const router = Router();

// All analytics routes require authentication + manager/admin role
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

router.get('/kpi', getKPI);
router.get('/distribution', getDistribution);
router.get('/safety-stock', getSafetyStock);
router.get('/trend', getTrend);
router.get('/consumption', validate(schemas.analytics.consumption, 'query'), getConsumption);
router.get('/age', validate(schemas.analytics.age, 'query'), getAge);
router.get('/turnover', validate(schemas.analytics.turnover, 'query'), getTurnover);

module.exports = router;
