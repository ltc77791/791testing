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
  jwtExpiresIn: '24h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  // 微信小程序配置
  wxAppId: process.env.WX_APPID || '',
  wxAppSecret: process.env.WX_APP_SECRET || '',
  // 订阅消息模板 ID
  wxTemplateIds: {
    stockAlert: process.env.WX_TPL_STOCK_ALERT || 'vopU72-_cp3VgTejH4OvJwvTPdmZw0U07oqnrwFPf_Q',
    approvalResult: process.env.WX_TPL_APPROVAL_RESULT || 'giSmlLFMc32RwQY2xCAo4Lnf4ZzurdzcXMMkhr-rIBQ',
    requestSubmit: process.env.WX_TPL_REQUEST_SUBMIT || '9fsxaUqwRByLo6Ed6RQlkMOENU_FWunc9766WN1eB2E',
  },
};
