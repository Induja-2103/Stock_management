// Express router for inventory expiry and batch write-offs
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { round4 } = require('../costing');

// POST /expiry/writeoff?asOf=
router.post('/writeoff', async (req, res) => {
  const asOf = req.body.asOf || req.query.asOf || new Date().toISOString().slice(0, 10);

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Find all expired batches that still have positive remaining inventory on or before asOf
    const expiredBatchesQuery = `
      SELECT 
        l.item_id,
        i.code AS item_code,
        i.name AS item_name,
        l.batch_no,
        TO_CHAR(l.expiry_date, 'YYYY-MM-DD') AS expiry_date,
        SUM(CASE WHEN l.direction = 'IN' THEN l.qty ELSE -l.qty END) AS remaining_qty
      FROM stock_ledger l
      JOIN items i ON i.id = l.item_id
      WHERE l.batch_no IS NOT NULL 
        AND l.expiry_date IS NOT NULL
        AND l.expiry_date <= $1
        AND l.effective_date <= $1
      GROUP BY l.item_id, i.code, i.name, l.batch_no, l.expiry_date
      HAVING SUM(CASE WHEN l.direction = 'IN' THEN l.qty ELSE -l.qty END) > 0.0001
      ORDER BY l.item_id, l.batch_no
    `;

    const expiredBatchesRes = await client.query(expiredBatchesQuery, [asOf]);
    const expiredBatches = expiredBatchesRes.rows;

    const writtenOffMovements = [];

    // 2. Insert SCRAP movements for each expired batch with remaining stock
    for (const batch of expiredBatches) {
      const scrapQty = round4(batch.remaining_qty);
      if (scrapQty <= 0) continue;

      const note = `Auto-writeoff: Expired batch ${batch.batch_no} (expired on ${batch.expiry_date})`;

      const insertRes = await client.query(
        `INSERT INTO stock_ledger (
          item_id, movement_type, qty, direction, effective_date, batch_no, expiry_date, note
        ) VALUES ($1, 'SCRAP', $2, 'OUT', $3, $4, $5, $6)
        RETURNING id, item_id, movement_type, qty, direction,
                  TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
                  batch_no,
                  TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                  note`,
        [batch.item_id, scrapQty, asOf, batch.batch_no, batch.expiry_date, note]
      );

      const scrapRow = insertRes.rows[0];
      scrapRow.item_code = batch.item_code;
      scrapRow.item_name = batch.item_name;
      writtenOffMovements.push(scrapRow);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      asOf,
      count: writtenOffMovements.length,
      writtenOff: writtenOffMovements,
      message: writtenOffMovements.length > 0
        ? `Successfully wrote off ${writtenOffMovements.length} expired batch(es).`
        : 'No expired batches with remaining stock found for the specified date.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Write-off failed', message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

