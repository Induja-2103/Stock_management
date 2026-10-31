// Express router for stock ledger movements
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { costItem, round4 } = require('../costing');

const VALID_MOVEMENT_TYPES = [
  'RECEIPT',
  'ISSUE_PRODUCTION',
  'PRODUCTION_OUTPUT',
  'SALE',
  'SALES_RETURN',
  'SCRAP'
];

const IN_TYPES = ['RECEIPT', 'PRODUCTION_OUTPUT', 'SALES_RETURN'];
const OUT_TYPES = ['SALE', 'ISSUE_PRODUCTION', 'SCRAP'];

// POST /movements - Append a new stock movement
router.post('/', async (req, res) => {
  const {
    item_id,
    movement_type,
    qty,
    unit_cost,
    sale_price,
    effective_date,
    batch_no,
    expiry_date,
    ref_sale_id,
    note,
    receipt_data
  } = req.body;

  // 1. Validate mandatory fields
  if (!item_id || !movement_type || qty === undefined || qty === null || !effective_date) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'item_id, movement_type, qty, and effective_date are required fields.'
    });
  }

  const normalizedType = String(movement_type).trim().toUpperCase();
  if (!VALID_MOVEMENT_TYPES.includes(normalizedType)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: `Invalid movement_type: ${movement_type}. Must be one of ${VALID_MOVEMENT_TYPES.join(', ')}.`
    });
  }

  const parsedQty = Number(qty);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Quantity must be a positive number greater than 0.'
    });
  }

  const direction = IN_TYPES.includes(normalizedType) ? 'IN' : 'OUT';

  // Cost validation for incoming receipts/production
  if ((normalizedType === 'RECEIPT' || normalizedType === 'PRODUCTION_OUTPUT') && (unit_cost === undefined || unit_cost === null || Number(unit_cost) < 0)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: `unit_cost is required and must be non-negative for movement type ${normalizedType}.`
    });
  }

  try {
    // 2. Fetch Item details
    const itemResult = await db.query(
      `SELECT id, code, name, unit, costing_method FROM items WHERE id = $1`,
      [item_id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Item with id ${item_id} does not exist.`
      });
    }

    const item = itemResult.rows[0];

    // 3. Load all existing movements for this item ordered chronologically
    const ledgerResult = await db.query(
      `SELECT id, item_id, movement_type, qty, direction, unit_cost, sale_price,
              TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
              entered_date, batch_no,
              TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
              ref_sale_id, note, receipt_data
       FROM stock_ledger
       WHERE item_id = $1
       ORDER BY effective_date ASC, id ASC`,
      [item_id]
    );

    const existingRows = ledgerResult.rows;

    // 4. Run baseline costing replay before adding candidate row
    const beforeResult = costItem(item.costing_method, existingRows);

    // Check if backdated (earlier than the latest existing row)
    let isBackdated = false;
    if (existingRows.length > 0) {
      const latestExistingDate = existingRows[existingRows.length - 1].effective_date;
      if (effective_date < latestExistingDate) {
        isBackdated = true;
      }
    }

    // 5. Construct candidate simulated row
    const candidateRow = {
      id: 999999999, // transient placeholder ID
      item_id: Number(item_id),
      movement_type: normalizedType,
      qty: parsedQty,
      direction,
      unit_cost: unit_cost !== undefined && unit_cost !== null ? Number(unit_cost) : null,
      sale_price: sale_price !== undefined && sale_price !== null ? Number(sale_price) : null,
      effective_date: String(effective_date).slice(0, 10),
      ref_sale_id: ref_sale_id ? Number(ref_sale_id) : null,
      batch_no: batch_no || null,
      expiry_date: expiry_date ? String(expiry_date).slice(0, 10) : null,
      note: note || null,
      receipt_data: receipt_data || null,
    };

    // 6. Run replay simulation after adding the new candidate row
    let afterResult;
    try {
      afterResult = costItem(item.costing_method, [...existingRows, candidateRow]);
    } catch (costErr) {
      return res.status(400).json({
        error: 'Costing validation failed',
        message: costErr.message
      });
    }

    // 7. Insert the row into the append-only stock_ledger
    const insertResult = await db.query(
      `INSERT INTO stock_ledger (
        item_id, movement_type, qty, direction, unit_cost, sale_price,
        effective_date, batch_no, expiry_date, ref_sale_id, note, receipt_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, item_id, movement_type, qty, direction, unit_cost, sale_price,
                TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
                entered_date, batch_no,
                TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                ref_sale_id, note, receipt_data`,
      [
        item_id,
        normalizedType,
        parsedQty,
        direction,
        unit_cost !== undefined && unit_cost !== null ? Number(unit_cost) : null,
        sale_price !== undefined && sale_price !== null ? Number(sale_price) : null,
        effective_date,
        batch_no || null,
        expiry_date || null,
        ref_sale_id || null,
        note || null,
        receipt_data || null,
      ]
    );

    const insertedMovement = insertResult.rows[0];

    // 8. If backdated, compute changedCosts list
    const changedCosts = [];
    if (isBackdated) {
      const beforeMap = new Map();
      for (const m of beforeResult.movements) {
        beforeMap.set(String(m.id), m);
      }

      for (const afterMov of afterResult.movements) {
        if (afterMov.id === 999999999) continue;
        const beforeMov = beforeMap.get(String(afterMov.id));
        if (beforeMov) {
          const oldCost = round4(beforeMov.unit_cost);
          const newCost = round4(afterMov.unit_cost);
          const diff = round4(newCost - oldCost);

          if (Math.abs(diff) > 0.00001) {
            changedCosts.push({
              id: afterMov.id,
              movement_type: afterMov.movement_type,
              effective_date: afterMov.effective_date,
              old_cost: oldCost,
              new_cost: newCost,
              difference: diff,
            });
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      movement: insertedMovement,
      changedCosts,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /movements - Filter by item and date range with dynamically computed costs
router.get('/', async (req, res) => {
  const { item_id, from, to } = req.query;

  try {
    if (item_id) {
      // 1. Fetch specific item
      const itemRes = await db.query(
        `SELECT id, code, name, unit, costing_method FROM items WHERE id = $1`,
        [item_id]
      );
      if (itemRes.rows.length === 0) {
        return res.status(404).json({ error: 'Not found', message: `Item with id ${item_id} not found.` });
      }
      const item = itemRes.rows[0];

      // 2. Load all historical movements for item to compute cumulative FIFO/WAC accurately
      let queryText = `
        SELECT id, item_id, movement_type, qty, direction, unit_cost, sale_price,
               TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
               entered_date, batch_no,
               TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
               ref_sale_id, note, receipt_data
        FROM stock_ledger
        WHERE item_id = $1
      `;
      const queryParams = [item_id];

      if (to) {
        queryText += ` AND effective_date <= $2`;
        queryParams.push(to);
      }

      queryText += ` ORDER BY effective_date ASC, id ASC`;

      const ledgerRes = await db.query(queryText, queryParams);
      const replayed = costItem(item.costing_method, ledgerRes.rows);

      // Filter by 'from' if specified
      let movements = replayed.movements;
      if (from) {
        movements = movements.filter(m => m.effective_date >= from);
      }

      return res.json({
        item,
        movements,
        closingQty: replayed.closingQty,
        closingValue: replayed.closingValue,
      });
    } else {
      // Multi-item fetch
      const itemsRes = await db.query(`SELECT id, code, name, unit, costing_method FROM items ORDER BY code ASC`);
      const items = itemsRes.rows;

      let allMovements = [];

      for (const itm of items) {
        let q = `
          SELECT id, item_id, movement_type, qty, direction, unit_cost, sale_price,
                 TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
                 entered_date, batch_no,
                 TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                 ref_sale_id, note, receipt_data
          FROM stock_ledger
          WHERE item_id = $1
        `;
        const p = [itm.id];
        if (to) {
          q += ` AND effective_date <= $2`;
          p.push(to);
        }
        q += ` ORDER BY effective_date ASC, id ASC`;

        const rowRes = await db.query(q, p);
        if (rowRes.rows.length > 0) {
          const replay = costItem(itm.costing_method, rowRes.rows);
          let filtered = replay.movements;
          if (from) {
            filtered = filtered.filter(m => m.effective_date >= from);
          }
          // Attach item code and name
          for (const m of filtered) {
            m.item_code = itm.code;
            m.item_name = itm.name;
            m.unit = itm.unit;
            allMovements.push(m);
          }
        }
      }

      // Sort final result descending for display
      allMovements.sort((a, b) => {
        const d = String(b.effective_date).localeCompare(String(a.effective_date));
        return d !== 0 ? d : Number(b.id || 0) - Number(a.id || 0);
      });

      return res.json(allMovements);
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

module.exports = router;

