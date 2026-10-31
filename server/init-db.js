const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initDb(seed = true) {
  try {
    console.log('Connecting to PostgreSQL database...');
    
    // 1. Read schema.sql
    const schemaSqlPath = path.join(__dirname, '../sql/schema.sql');
    let schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');

    // Add receipt_data column to schema if not present
    if (!schemaSql.includes('receipt_data')) {
      schemaSql = schemaSql.replace(
        'note TEXT NULL',
        'note TEXT NULL,\n    receipt_data TEXT NULL'
      );
    }

    console.log('Applying database schema...');
    await pool.query(schemaSql);
    
    // Check if receipt_data column exists on stock_ledger (for existing tables)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='stock_ledger' AND column_name='receipt_data'
        ) THEN
          ALTER TABLE stock_ledger ADD COLUMN receipt_data TEXT NULL;
        END IF;
      END $$;
    `);

    console.log('Schema successfully applied!');

    if (seed) {
      // Check if items table has rows
      const itemsCount = await pool.query('SELECT COUNT(*) FROM items');
      if (parseInt(itemsCount.rows[0].count, 10) === 0) {
        console.log('Items table is empty. Seeding initial data from seed.sql...');
        const seedSqlPath = path.join(__dirname, '../sql/seed.sql');
        const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
        await pool.query(seedSql);
        console.log('Seed data successfully applied!');
      } else {
        console.log(`Items table already has ${itemsCount.rows[0].count} item(s). Skipping seed.`);
      }
    }

    const check = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables in public schema:', check.rows.map(r => r.table_name));

    return true;
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

if (require.main === module) {
  initDb(true)
    .then(() => {
      console.log('Database initialization complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err.message);
      process.exit(1);
    });
}

module.exports = { initDb };

