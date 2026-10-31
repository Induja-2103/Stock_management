// Main server entry point
require('dotenv').config();
const express = require('express');
const db = require('./db');
const { initDb } = require('./init-db');

const itemsRouter = require('./src/routes/items');
const movementsRouter = require('./src/routes/movements');
const reportsRouter = require('./src/routes/reports');
const expiryRouter = require('./src/routes/expiry');

const app = express();
const PORT = process.env.PORT || 5000;

// Built-in body parsing with higher payload limit for receipt images
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Simple CORS middleware without extra libraries
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() AS current_time');
    res.json({
      status: 'ok',
      db: 'connected',
      dbTime: result.rows[0].current_time,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'disconnected',
      error: err.message,
      serverTime: new Date().toISOString()
    });
  }
});

// Mount application routes
app.use('/items', itemsRouter);
app.use('/movements', movementsRouter);
app.use('/reports', reportsRouter);
app.use('/expiry', expiryRouter);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.url} does not exist.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server if run directly
if (require.main === module) {
  initDb(false)
    .catch((err) => console.warn('Database initialization warning:', err.message))
    .finally(() => {
      app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
      });
    });
}

module.exports = app;
