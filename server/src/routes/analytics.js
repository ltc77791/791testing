const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
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
router.get('/consumption', getConsumption);
router.get('/age', getAge);
router.get('/turnover', getTurnover);

module.exports = router;
