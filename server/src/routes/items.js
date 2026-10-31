// Express router for items master management
const express = require('express');
const router = express.Router();
const db = require('../../db');

// GET /items - List all items
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, unit, costing_method, created_at
       FROM items
       ORDER BY code ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /items - Create a new item
router.post('/', async (req, res) => {
  const { code, name, unit, costing_method } = req.body;

  // Validation
  if (!code || !name || !unit || !costing_method) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Fields code, name, unit, and costing_method are required.'
    });
  }

  const normalizedMethod = String(costing_method).trim().toUpperCase();
  if (normalizedMethod !== 'FIFO' && normalizedMethod !== 'WAC') {
    return res.status(400).json({
      error: 'Validation failed',
      message: "costing_method must be either 'FIFO' or 'WAC'."
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO items (code, name, unit, costing_method)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, unit, costing_method, created_at`,
      [code.trim(), name.trim(), unit.trim(), normalizedMethod]
    );

    res.status(201).json({
      success: true,
      item: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: `An item with code '${code}' already exists.`
      });
    }
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

module.exports = router;

