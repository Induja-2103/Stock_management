// PostgreSQL database connection pool
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'stock_management',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'INDU210306',
});

// Helper for running queries
const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};

