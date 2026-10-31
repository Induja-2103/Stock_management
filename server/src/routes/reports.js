// Express router for finance reports: Valuation and COGS
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { costItem, round4 } = require('../costing');

// GET /reports/valuation?asOf=
router.get('/valuation', async (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

  try {
    const itemsRes = await db.query(
      `SELECT id, code, name, unit, costing_method FROM items ORDER BY code ASC`
    );
    const items = itemsRes.rows;

    let grandTotalValue = 0;
    const valuationList = [];

    for (const item of items) {
      const ledgerRes = await db.query(
        `SELECT id, item_id, movement_type, qty, direction, unit_cost, sale_price,
                TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
                entered_date, batch_no,
                TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                ref_sale_id, note
         FROM stock_ledger
         WHERE item_id = $1 AND effective_date <= $2
         ORDER BY effective_date ASC, id ASC`,
        [item.id, asOf]
      );

      const replay = costItem(item.costing_method, ledgerRes.rows);
      const qty = replay.closingQty;
      const totalValue = replay.closingValue;
      const unitCost = qty > 0 ? round4(totalValue / qty) : 0;

      grandTotalValue = round4(grandTotalValue + totalValue);

      valuationList.push({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        costing_method: item.costing_method,
        qty,
        unit_cost: unitCost,
        total_value: totalValue,
      });
    }

    res.json({
      asOf,
      totalValuation: grandTotalValue,
      itemCount: items.length,
      itemsWithStock: valuationList.filter(i => i.qty > 0).length,
      items: valuationList,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /reports/cogs?from=&to=
router.get('/cogs', async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  // Default 'from' to start of current year if unspecified
  const from = req.query.from || `${new Date().getFullYear()}-01-01`;

  try {
    const itemsRes = await db.query(
      `SELECT id, code, name, unit, costing_method FROM items ORDER BY code ASC`
    );
    const items = itemsRes.rows;

    let totalSaleCost = 0;
    let totalSalesReturnCost = 0;
    let totalSaleRevenue = 0;
    let totalReturnRevenue = 0;

    const itemBreakdown = [];
    const transactions = [];

    for (const item of items) {
      // Must replay up to 'to' date to correctly determine FIFO/WAC layers
      const ledgerRes = await db.query(
        `SELECT id, item_id, movement_type, qty, direction, unit_cost, sale_price,
                TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date,
                entered_date, batch_no,
                TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                ref_sale_id, note
         FROM stock_ledger
         WHERE item_id = $1 AND effective_date <= $2
         ORDER BY effective_date ASC, id ASC`,
        [item.id, to]
      );

      const replay = costItem(item.costing_method, ledgerRes.rows);

      // Filter replayed movements within period [from, to]
      const periodMovements = replay.movements.filter(
        m => m.effective_date >= from && m.effective_date <= to
      );

      let itemSaleCost = 0;
      let itemReturnCost = 0;
      let itemSaleRevenue = 0;
      let itemReturnRevenue = 0;

      for (const m of periodMovements) {
        if (m.movement_type === 'SALE') {
          const rev = round4(m.qty * (m.sale_price || 0));
          itemSaleCost = round4(itemSaleCost + m.value);
          itemSaleRevenue = round4(itemSaleRevenue + rev);

          transactions.push({
            ...m,
            item_code: item.code,
            item_name: item.name,
            unit: item.unit,
            cost: m.value,
            revenue: rev,
          });
        } else if (m.movement_type === 'SALES_RETURN') {
          const rev = round4(m.qty * (m.sale_price || 0));
          itemReturnCost = round4(itemReturnCost + m.value);
          itemReturnRevenue = round4(itemReturnRevenue + rev);

          transactions.push({
            ...m,
            item_code: item.code,
            item_name: item.name,
            unit: item.unit,
            cost: -m.value, // negative cost for COGS reduction
            revenue: -rev,  // negative revenue
          });
        }
      }

      const itemCogs = round4(itemSaleCost - itemReturnCost);
      const itemNetRevenue = round4(itemSaleRevenue - itemReturnRevenue);
      const itemGrossMargin = round4(itemNetRevenue - itemCogs);

      if (itemSaleCost > 0 || itemReturnCost > 0 || itemSaleRevenue > 0) {
        itemBreakdown.push({
          item_id: item.id,
          code: item.code,
          name: item.name,
          costing_method: item.costing_method,
          sale_cost: itemSaleCost,
          sales_return_cost: itemReturnCost,
          cogs: itemCogs,
          revenue: itemNetRevenue,
          gross_margin: itemGrossMargin,
          gross_margin_pct: itemNetRevenue > 0 ? round4((itemGrossMargin / itemNetRevenue) * 100) : 0,
        });
      }

      totalSaleCost = round4(totalSaleCost + itemSaleCost);
      totalSalesReturnCost = round4(totalSalesReturnCost + itemReturnCost);
      totalSaleRevenue = round4(totalSaleRevenue + itemSaleRevenue);
      totalReturnRevenue = round4(totalReturnRevenue + itemReturnRevenue);
    }

    const cogs = round4(totalSaleCost - totalSalesReturnCost);
    const revenue = round4(totalSaleRevenue - totalReturnRevenue);
    const grossMargin = round4(revenue - cogs);
    const grossMarginPct = revenue > 0 ? round4((grossMargin / revenue) * 100) : 0;

    res.json({
      period: { from, to },
      cogs,
      revenue,
      grossMargin,
      grossMarginPercentage: grossMarginPct,
      salesCost: totalSaleCost,
      salesReturnCost: totalSalesReturnCost,
      items: itemBreakdown,
      transactions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

module.exports = router;

