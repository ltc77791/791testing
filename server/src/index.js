const express = require('express');
const cors = require('cors');
const config = require('./config');
const { connectDB, initCollections } = require('./db');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/part-types', require('./routes/partTypes'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/export', require('./routes/export'));

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ code: 1, message: `Route not found: ${req.method} ${req.path}` });
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ code: 1, message: 'Internal server error' });
});

// --- Start ---
async function start() {
  try {
    await connectDB();
    await initCollections();

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
