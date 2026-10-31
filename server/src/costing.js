// Pure inventory costing functions for FIFO and WAC replay
// No database code. Maintains 4-decimal precision internally.

/**
 * Rounds a number to 4 decimal places.
 */
function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

/**
 * Formats a monetary value for display (rounds to standard 2 decimal places).
 */
function formatDisplay(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Compares two movements: first by effective_date ASC, then by id ASC.
 */
function compareMovements(a, b) {
  const dateA = a.effective_date instanceof Date
    ? a.effective_date.toISOString().slice(0, 10)
    : String(a.effective_date || '').slice(0, 10);
  const dateB = b.effective_date instanceof Date
    ? b.effective_date.toISOString().slice(0, 10)
    : String(b.effective_date || '').slice(0, 10);

  if (dateA !== dateB) {
    return dateA.localeCompare(dateB);
  }
  return Number(a.id || 0) - Number(b.id || 0);
}

/**
 * Replays movements using FIFO (First-In, First-Out).
 */
function costItemFIFO(sortedMovements) {
  const layers = []; // [{ qty, cost }]
  const salesMap = new Map();
  const processedMovements = [];
  let currentStock = 0;

  for (const m of sortedMovements) {
    const qty = round4(m.qty);
    const mType = (m.movement_type || '').toUpperCase();
    const isOut = m.direction === 'OUT' || ['SALE', 'ISSUE_PRODUCTION', 'SCRAP'].includes(mType);
    const isReturn = mType === 'SALES_RETURN';

    if (qty <= 0) {
      throw new Error(`Movement quantity must be greater than zero for movement id ${m.id || ''}`);
    }

    if (isReturn) {
      // SALES_RETURN: adds a new layer at original sale cost
      const refId = m.ref_sale_id ? String(m.ref_sale_id) : null;
      let returnCost;

      if (refId && salesMap.has(refId)) {
        returnCost = salesMap.get(refId).unit_cost;
      } else if (m.unit_cost !== null && m.unit_cost !== undefined) {
        returnCost = round4(m.unit_cost);
      } else {
        throw new Error(
          `Original sale with id ${m.ref_sale_id} not found for SALES_RETURN on ${m.effective_date}`
        );
      }

      const value = round4(qty * returnCost);
      layers.push({ qty, cost: returnCost });
      currentStock = round4(currentStock + qty);

      processedMovements.push({
        ...m,
        qty,
        unit_cost: returnCost,
        value,
      });
    } else if (isOut) {
      // Outgoing: validate stock sufficiency
      if (round4(currentStock) < qty) {
        throw new Error(
          `Insufficient stock on ${m.effective_date}: requested ${qty}, available ${currentStock}`
        );
      }

      let remainingToConsume = qty;
      let totalConsumedCost = 0;

      while (remainingToConsume > 0.00001 && layers.length > 0) {
        const layer = layers[0];
        if (layer.qty <= remainingToConsume + 0.00001) {
          totalConsumedCost += layer.qty * layer.cost;
          remainingToConsume = round4(remainingToConsume - layer.qty);
          layers.shift();
        } else {
          totalConsumedCost += remainingToConsume * layer.cost;
          layer.qty = round4(layer.qty - remainingToConsume);
          remainingToConsume = 0;
        }
      }

      const totalValue = round4(totalConsumedCost);
      const unitCost = round4(totalValue / qty);
      currentStock = round4(currentStock - qty);

      const processed = {
        ...m,
        qty,
        unit_cost: unitCost,
        value: totalValue,
      };

      if (mType === 'SALE' && m.id !== undefined && m.id !== null) {
        salesMap.set(String(m.id), { unit_cost: unitCost, value: totalValue });
      }

      processedMovements.push(processed);
    } else {
      // Incoming: RECEIPT or PRODUCTION_OUTPUT
      const unitCost = round4(m.unit_cost || 0);
      const value = round4(qty * unitCost);

      layers.push({ qty, cost: unitCost });
      currentStock = round4(currentStock + qty);

      processedMovements.push({
        ...m,
        qty,
        unit_cost: unitCost,
        value,
      });
    }
  }

  const closingQty = round4(layers.reduce((sum, l) => sum + l.qty, 0));
  const closingValue = round4(layers.reduce((sum, l) => sum + (l.qty * l.cost), 0));

  return {
    movements: processedMovements,
    closingQty,
    closingValue,
  };
}

/**
 * Replays movements using WAC (Weighted Average Cost).
 */
function costItemWAC(sortedMovements) {
  let currentStock = 0;
  let runningAverage = 0;
  let currentValue = 0;
  const salesMap = new Map();
  const processedMovements = [];

  for (const m of sortedMovements) {
    const qty = round4(m.qty);
    const mType = (m.movement_type || '').toUpperCase();
    const isOut = m.direction === 'OUT' || ['SALE', 'ISSUE_PRODUCTION', 'SCRAP'].includes(mType);
    const isReturn = mType === 'SALES_RETURN';

    if (qty <= 0) {
      throw new Error(`Movement quantity must be greater than zero for movement id ${m.id || ''}`);
    }

    if (isReturn) {
      const refId = m.ref_sale_id ? String(m.ref_sale_id) : null;
      let returnCost;

      if (refId && salesMap.has(refId)) {
        returnCost = salesMap.get(refId).unit_cost;
      } else if (m.unit_cost !== null && m.unit_cost !== undefined) {
        returnCost = round4(m.unit_cost);
      } else {
        throw new Error(
          `Original sale with id ${m.ref_sale_id} not found for SALES_RETURN on ${m.effective_date}`
        );
      }

      const inValue = round4(qty * returnCost);
      const newStock = round4(currentStock + qty);
      const newValue = round4(currentValue + inValue);

      currentStock = newStock;
      currentValue = newValue;
      runningAverage = newStock > 0 ? round4(newValue / newStock) : 0;

      processedMovements.push({
        ...m,
        qty,
        unit_cost: returnCost,
        value: inValue,
      });
    } else if (isOut) {
      if (round4(currentStock) < qty) {
        throw new Error(
          `Insufficient stock on ${m.effective_date}: requested ${qty}, available ${currentStock}`
        );
      }

      const outCost = runningAverage;
      const outValue = round4(qty * outCost);

      currentStock = round4(currentStock - qty);
      currentValue = round4(currentValue - outValue);

      if (currentStock <= 0.00001) {
        currentStock = 0;
        currentValue = 0;
        runningAverage = 0;
      }

      const processed = {
        ...m,
        qty,
        unit_cost: outCost,
        value: outValue,
      };

      if (mType === 'SALE' && m.id !== undefined && m.id !== null) {
        salesMap.set(String(m.id), { unit_cost: outCost, value: outValue });
      }

      processedMovements.push(processed);
    } else {
      // Incoming: RECEIPT or PRODUCTION_OUTPUT
      const inCost = round4(m.unit_cost || 0);
      const inValue = round4(qty * inCost);
      const newStock = round4(currentStock + qty);
      const newValue = round4(currentValue + inValue);

      currentStock = newStock;
      currentValue = newValue;
      runningAverage = newStock > 0 ? round4(newValue / newStock) : 0;

      processedMovements.push({
        ...m,
        qty,
        unit_cost: inCost,
        value: inValue,
      });
    }
  }

  const closingQty = round4(currentStock);
  const closingValue = round4(currentValue);

  return {
    movements: processedMovements,
    closingQty,
    closingValue,
  };
}

/**
 * Calculates stock movements, closing quantity, and closing valuation for one item.
 * 
 * @param {'FIFO'|'WAC'} method - Costing method
 * @param {Array<Object>} movements - List of movements for a single item
 * @returns {{ movements: Array<Object>, closingQty: number, closingValue: number }}
 */
function costItem(method, movements) {
  if (!movements || !Array.isArray(movements)) {
    return { movements: [], closingQty: 0, closingValue: 0 };
  }

  const sortedMovements = [...movements].sort(compareMovements);
  const normalizedMethod = String(method || '').toUpperCase();

  if (normalizedMethod === 'FIFO') {
    return costItemFIFO(sortedMovements);
  } else if (normalizedMethod === 'WAC') {
    return costItemWAC(sortedMovements);
  } else {
    throw new Error(`Unsupported costing method: ${method}. Must be FIFO or WAC.`);
  }
}

module.exports = {
  costItem,
  round4,
  formatDisplay,
  compareMovements,
};

