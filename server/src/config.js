require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5501,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/spare_parts',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  jwtExpiresIn: '24h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
};
