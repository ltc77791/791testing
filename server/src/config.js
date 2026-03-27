require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5501,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/spare_parts',
  jwtSecret: (() => {
    if (!process.env.JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable is required');
      process.exit(1);
    }
    return process.env.JWT_SECRET;
  })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',  // ★ Feature #6: Hard timeout — 修改此值调整JWT过期时间 (如 '2m' 用于测试)
  // ★ Feature #5: Soft timeout (前端无操作自动登出) — 单位: 分钟
  softTimeoutMinutes: Number(process.env.SOFT_TIMEOUT_MINUTES) || 15,  // 修改此值或设环境变量 SOFT_TIMEOUT_MINUTES (如 2 用于测试)
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  // 微信小程序配置
  wxAppId: process.env.WX_APPID || '',
  wxAppSecret: process.env.WX_APP_SECRET || '',
  // ★ Feature #7: Account lockout settings
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES) || 30,
  // 订阅消息模板 ID
  wxTemplateIds: {
    stockAlert: process.env.WX_TPL_STOCK_ALERT || 'vopU72-_cp3VgTejH4OvJwvTPdmZw0U07oqnrwFPf_Q',
    approvalResult: process.env.WX_TPL_APPROVAL_RESULT || 'giSmlLFMc32RwQY2xCAo4Lnf4ZzurdzcXMMkhr-rIBQ',
    requestSubmit: process.env.WX_TPL_REQUEST_SUBMIT || '9fsxaUqwRByLo6Ed6RQlkMOENU_FWunc9766WN1eB2E',
  },
};
