const { costItem, round4, formatDisplay } = require('../server/src/costing');

describe('Sample Ledger Seed Verification Tests', () => {
  // Test Data reflecting sql/seed.sql
  const rawSeedData = {
    STEEL: {
      method: 'FIFO',
      movements: [
        { id: 1, effective_date: '2026-10-01', movement_type: 'RECEIPT', qty: 90, unit_cost: 60.0, direction: 'IN' },
        { id: 2, effective_date: '2026-10-05', movement_type: 'RECEIPT', qty: 10, unit_cost: 64.0, direction: 'IN', entered_date: '2026-10-12' },
        { id: 3, effective_date: '2026-10-08', movement_type: 'RECEIPT', qty: 50, unit_cost: 70.0, direction: 'IN' },
        { id: 4, effective_date: '2026-10-10', movement_type: 'ISSUE_PRODUCTION', qty: 100, direction: 'OUT' },
      ],
    },
    PAINT: {
      method: 'WAC',
      movements: [
        { id: 5, effective_date: '2026-10-01', movement_type: 'RECEIPT', qty: 100, unit_cost: 10.0, direction: 'IN' },
        { id: 6, effective_date: '2026-10-05', movement_type: 'RECEIPT', qty: 100, unit_cost: 13.5, direction: 'IN' },
        { id: 7, effective_date: '2026-10-15', movement_type: 'ISSUE_PRODUCTION', qty: 100, direction: 'OUT' },
      ],
    },
    ADHESIVE: {
      method: 'FIFO',
      movements: [
        { id: 8, effective_date: '2026-10-01', movement_type: 'RECEIPT', qty: 20, unit_cost: 20.0, direction: 'IN', batch_no: 'ADH-01', expiry_date: '2026-10-15' },
        { id: 9, effective_date: '2026-10-05', movement_type: 'RECEIPT', qty: 49, unit_cost: 20.0, direction: 'IN', batch_no: 'ADH-02', expiry_date: '2026-12-31' },
        { id: 10, effective_date: '2026-10-20', movement_type: 'SCRAP', qty: 20, direction: 'OUT', batch_no: 'ADH-01', note: 'Expired batch write-off' },
      ],
    },
    CHAIR: {
      method: 'WAC',
      movements: [
        { id: 11, effective_date: '2026-10-01', movement_type: 'PRODUCTION_OUTPUT', qty: 100, unit_cost: 120.0, direction: 'IN' },
        { id: 12, effective_date: '2026-10-05', movement_type: 'PRODUCTION_OUTPUT', qty: 121, unit_cost: 124.9813, direction: 'IN' },
        { id: 13, effective_date: '2026-10-10', movement_type: 'SALE', qty: 90, sale_price: 185.0, direction: 'OUT' },
        { id: 14, effective_date: '2026-10-15', movement_type: 'SALES_RETURN', qty: 10, ref_sale_id: 13, sale_price: 185.0, direction: 'IN' },
      ],
    },
    TABLE: {
      method: 'FIFO',
      movements: [
        { id: 15, effective_date: '2026-10-01', movement_type: 'PRODUCTION_OUTPUT', qty: 20, unit_cost: 480.0, direction: 'IN' },
        { id: 16, effective_date: '2026-10-12', movement_type: 'SALE', qty: 20, sale_price: 750.0, direction: 'OUT' },
      ],
    },
  };

  test('Check 1: STEEL 10-Oct issue costs 6,040 after the late receipt (would be 6,100 without it, difference -60)', () => {
    // 1. Without late receipt (id: 2 omitted)
    const withoutLate = rawSeedData.STEEL.movements.filter((m) => m.id !== 2);
    const resultWithoutLate = costItem('FIFO', withoutLate);
    const issueWithout = resultWithoutLate.movements.find((m) => m.id === 4);
    expect(issueWithout.value).toBe(6100.0);

    // 2. With late receipt (id: 2 included with effective_date 2026-10-05)
    const resultWithLate = costItem('FIFO', rawSeedData.STEEL.movements);
    const issueWith = resultWithLate.movements.find((m) => m.id === 4);
    expect(issueWith.value).toBe(6040.0);

    // 3. Difference is exactly -60
    const difference = issueWith.value - issueWithout.value;
    expect(difference).toBe(-60.0);
  });

  test('Check 2: PAINT closes at 100 L worth 1,175', () => {
    const paintResult = costItem('WAC', rawSeedData.PAINT.movements);
    expect(paintResult.closingQty).toBe(100);
    expect(paintResult.closingValue).toBe(1175.0);
  });

  test('Check 3: CHAIR sales return is valued at 1,227.27', () => {
    const chairResult = costItem('WAC', rawSeedData.CHAIR.movements);
    const returnMovement = chairResult.movements.find((m) => m.id === 14);

    expect(returnMovement).toBeDefined();
    expect(formatDisplay(returnMovement.value)).toBe('1,227.27');
  });

  test('Check 4: The expired ADHESIVE write-off is 400', () => {
    const adhesiveResult = costItem('FIFO', rawSeedData.ADHESIVE.movements);
    const scrapMovement = adhesiveResult.movements.find((m) => m.id === 10);

    expect(scrapMovement).toBeDefined();
    expect(scrapMovement.value).toBe(400.0);
  });

  test('Check 5: Total stock value is 22,959.55', () => {
    const steelRes = costItem('FIFO', rawSeedData.STEEL.movements);
    const paintRes = costItem('WAC', rawSeedData.PAINT.movements);
    const adhesiveRes = costItem('FIFO', rawSeedData.ADHESIVE.movements);
    const chairRes = costItem('WAC', rawSeedData.CHAIR.movements);
    const tableRes = costItem('FIFO', rawSeedData.TABLE.movements);

    const totalStockValue =
      steelRes.closingValue +
      paintRes.closingValue +
      adhesiveRes.closingValue +
      chairRes.closingValue +
      tableRes.closingValue;

    expect(formatDisplay(totalStockValue)).toBe('22,959.55');
  });

  test('Check 6: COGS is 19,418.18', () => {
    const chairRes = costItem('WAC', rawSeedData.CHAIR.movements);
    const tableRes = costItem('FIFO', rawSeedData.TABLE.movements);

    const allReplayedMovements = [
      ...chairRes.movements,
      ...tableRes.movements,
    ];

    let salesCost = 0;
    let salesReturnCost = 0;

    for (const m of allReplayedMovements) {
      if (m.movement_type === 'SALE') {
        salesCost += m.value;
      } else if (m.movement_type === 'SALES_RETURN') {
        salesReturnCost += m.value;
      }
    }

    const cogs = salesCost - salesReturnCost;
    expect(formatDisplay(cogs)).toBe('19,418.18');
  });

  test('Check 7: Value in minus value out equals closing value (reconciliation line)', () => {
    const replayedItems = [
      costItem('FIFO', rawSeedData.STEEL.movements),
      costItem('WAC', rawSeedData.PAINT.movements),
      costItem('FIFO', rawSeedData.ADHESIVE.movements),
      costItem('WAC', rawSeedData.CHAIR.movements),
      costItem('FIFO', rawSeedData.TABLE.movements),
    ];

    let totalValIn = 0;
    let totalValOut = 0;
    let totalClosingVal = 0;

    for (const itemRes of replayedItems) {
      totalClosingVal += itemRes.closingValue;
      for (const m of itemRes.movements) {
        if (m.direction === 'IN') {
          totalValIn += m.value;
        } else if (m.direction === 'OUT') {
          totalValOut += m.value;
        }
      }
    }

    const netValue = totalValIn - totalValOut;
    expect(formatDisplay(netValue)).toBe(formatDisplay(totalClosingVal));
    expect(formatDisplay(netValue)).toBe('22,959.55');
  });

  test('Check 8: Inserting the same rows in a different order gives identical results', () => {
    // Reverse chronological input
    const reversedChair = [...rawSeedData.CHAIR.movements].reverse();
    const resultNormal = costItem('WAC', rawSeedData.CHAIR.movements);
    const resultReversed = costItem('WAC', reversedChair);

    expect(resultReversed.closingQty).toBe(resultNormal.closingQty);
    expect(formatDisplay(resultReversed.closingValue)).toBe(formatDisplay(resultNormal.closingValue));

    // Verify movement outputs match
    for (let i = 0; i < resultNormal.movements.length; i++) {
      const normalMov = resultNormal.movements[i];
      const reversedMov = resultReversed.movements.find((m) => m.id === normalMov.id);
      expect(reversedMov).toBeDefined();
      expect(reversedMov.unit_cost).toBe(normalMov.unit_cost);
      expect(reversedMov.value).toBe(normalMov.value);
    }
  });
});
