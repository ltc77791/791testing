const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { connectDB, initCollections, migrateApprovedRequests } = require('./db');

const app = express();

// --- Security & Middleware ---
// 1. Helmet: HSTS 仅在生产环境开启（避免本地 localhost 报错）
app.use(helmet({
  hsts: config.nodeEnv === 'production',
}));

// 2. CORS: 限制白名单，允许携 Cookie
if (!config.corsOrigin || config.corsOrigin === '*') {
  console.error('FATAL: CORS_ORIGIN must be set to a specific origin, not "*"');
  process.exit(1);
}
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// 3. Rate Limit: 防暴力请求，全局 15 分钟最多 1000 次，后续可单独对 /login 做严格限制
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { code: 1, message: '请求过于频繁，请稍后再试' },
});
app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
// 登录接口配置更严格的限流防爆破 (15分钟 20次)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { code: 1, message: '登录请求过多，请 15 分钟后再试' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/wx-bind', loginLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/part-types', require('./routes/partTypes'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/dictionaries', require('./routes/dictionaries'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/export', require('./routes/export'));

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ code: 1, message: `Route not found: ${req.method} ${req.path}` });
});

// --- Error handler ---
app.use((err, req, res, next) => {
  // Joi 校验错误
  if (err.isJoi) {
    const messages = err.details.map(d => d.message);
    return res.status(400).json({ code: 1, message: messages.join('; '), errors: messages });
  }

  // JSON 解析错误
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 1, message: '请求体 JSON 格式错误' });
  }

  // 请求体过大
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 1, message: '请求体过大，上限 10MB' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ code: 1, message: '服务器内部错误' });
});

// --- Start ---
async function start() {
  try {
    await connectDB();
    await initCollections();
    await migrateApprovedRequests();

    app.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
      console.log('Press Ctrl+C to stop');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = app; // for testing
