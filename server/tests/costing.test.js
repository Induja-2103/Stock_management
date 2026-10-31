const { costItem, round4, formatDisplay } = require('../src/costing');

describe('Inventory Costing Engine', () => {
  describe('FIFO Costing', () => {
    test('adds layers on RECEIPT and PRODUCTION_OUTPUT', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 100.0 },
        { id: 2, effective_date: '2026-01-05', movement_type: 'PRODUCTION_OUTPUT', qty: 5, unit_cost: 120.0 },
      ];

      const result = costItem('FIFO', movements);

      expect(result.closingQty).toBe(15);
      expect(result.closingValue).toBe(1600.0);
      expect(result.movements[0].value).toBe(1000.0);
      expect(result.movements[1].value).toBe(600.0);
    });

    test('outgoing movements consume oldest layers and can span multiple layers', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 10.0 },
        { id: 2, effective_date: '2026-01-05', movement_type: 'RECEIPT', qty: 10, unit_cost: 20.0 },
        { id: 3, effective_date: '2026-01-10', movement_type: 'SALE', qty: 15 },
      ];

      const result = costItem('FIFO', movements);

      // Consumes 10 @ 10 (=100) + 5 @ 20 (=100) = 200 total value
      const sale = result.movements[2];
      expect(sale.value).toBe(200.0);
      expect(sale.unit_cost).toBe(13.3333); // 200 / 15
      expect(result.closingQty).toBe(5);
      expect(result.closingValue).toBe(100.0); // 5 remaining @ 20
    });

    test('SALES_RETURN adds a new layer at original sale cost via ref_sale_id', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 10.0 },
        { id: 2, effective_date: '2026-01-02', movement_type: 'RECEIPT', qty: 10, unit_cost: 20.0 },
        { id: 3, effective_date: '2026-01-05', movement_type: 'SALE', qty: 15 }, // unit_cost: 13.3333
        { id: 4, effective_date: '2026-01-10', movement_type: 'SALES_RETURN', qty: 5, ref_sale_id: 3 },
      ];

      const result = costItem('FIFO', movements);
      const returnMov = result.movements[3];

      expect(returnMov.unit_cost).toBe(13.3333);
      expect(returnMov.value).toBe(66.6665);
      expect(result.closingQty).toBe(10);
      // 5 units @ 20 (=100) + 5 units @ 13.3333 (=66.6665)
      expect(result.closingValue).toBe(166.6665);
    });

    test('consumes correctly across ISSUE_PRODUCTION and SCRAP', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 20, unit_cost: 50.0 },
        { id: 2, effective_date: '2026-01-03', movement_type: 'ISSUE_PRODUCTION', qty: 12 },
        { id: 3, effective_date: '2026-01-05', movement_type: 'SCRAP', qty: 3 },
      ];

      const result = costItem('FIFO', movements);
      expect(result.movements[1].value).toBe(600.0);
      expect(result.movements[2].value).toBe(150.0);
      expect(result.closingQty).toBe(5);
      expect(result.closingValue).toBe(250.0);
    });
  });

  describe('WAC (Weighted Average Cost)', () => {
    test('incoming movements recalculate average, outgoing movements use current average', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 10.0 }, // 100
        { id: 2, effective_date: '2026-01-02', movement_type: 'RECEIPT', qty: 20, unit_cost: 25.0 }, // 500 => Total 600 / 30 = 20.0
        { id: 3, effective_date: '2026-01-05', movement_type: 'SALE', qty: 15 }, // uses 20.0 => 300
      ];

      const result = costItem('WAC', movements);
      const sale = result.movements[2];

      expect(sale.unit_cost).toBe(20.0);
      expect(sale.value).toBe(300.0);
      expect(result.closingQty).toBe(15);
      expect(result.closingValue).toBe(300.0);
    });

    test('SALES_RETURN uses original sale cost and recalculates weighted average', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 10.0 }, // 100
        { id: 2, effective_date: '2026-01-02', movement_type: 'RECEIPT', qty: 10, unit_cost: 20.0 }, // 200 => WAC = 15.0
        { id: 3, effective_date: '2026-01-05', movement_type: 'SALE', qty: 10 }, // Sold 10 @ 15.0 => leaves 10 @ 15.0 (value 150)
        { id: 4, effective_date: '2026-01-06', movement_type: 'RECEIPT', qty: 10, unit_cost: 30.0 }, // In 10 @ 30 (300) => 20 total, value 450, WAC = 22.5
        { id: 5, effective_date: '2026-01-08', movement_type: 'SALES_RETURN', qty: 5, ref_sale_id: 3 }, // Return 5 @ original sale cost 15.0 (75) => 25 total, value 525, WAC = 21.0
      ];

      const result = costItem('WAC', movements);
      const ret = result.movements[4];

      expect(ret.unit_cost).toBe(15.0);
      expect(ret.value).toBe(75.0);
      expect(result.closingQty).toBe(25);
      expect(result.closingValue).toBe(525.0);
    });

    test('handles inventory depletion to 0 and re-stocking gracefully', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 5, unit_cost: 10.0 },
        { id: 2, effective_date: '2026-01-02', movement_type: 'SALE', qty: 5 },
        { id: 3, effective_date: '2026-01-03', movement_type: 'RECEIPT', qty: 8, unit_cost: 40.0 },
      ];

      const result = costItem('WAC', movements);
      expect(result.movements[1].value).toBe(50.0);
      expect(result.closingQty).toBe(8);
      expect(result.closingValue).toBe(320.0);
    });
  });

  describe('Validation & Edge Cases', () => {
    test('throws error if stock would go below zero on any date', () => {
      const movements = [
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 5, unit_cost: 10.0 },
        { id: 2, effective_date: '2026-01-02', movement_type: 'SALE', qty: 10 },
      ];

      expect(() => costItem('FIFO', movements)).toThrow(/Insufficient stock/);
      expect(() => costItem('WAC', movements)).toThrow(/Insufficient stock/);
    });

    test('sorts movements by effective_date ASC then id ASC', () => {
      // Out of order input
      const movements = [
        { id: 2, effective_date: '2026-01-05', movement_type: 'SALE', qty: 4 },
        { id: 1, effective_date: '2026-01-01', movement_type: 'RECEIPT', qty: 10, unit_cost: 20.0 },
      ];

      const result = costItem('FIFO', movements);
      expect(result.movements[0].id).toBe(1);
      expect(result.movements[1].id).toBe(2);
      expect(result.closingQty).toBe(6);
    });

    test('throws error if unrecognised costing method is supplied', () => {
      expect(() => costItem('LIFO', [])).toThrow(/Unsupported costing method/);
    });

    test('round4 handles 4 decimal places and formatDisplay formats currency', () => {
      expect(round4(12.34567)).toBe(12.3457);
      expect(formatDisplay(12.3457)).toBe('12.35');
    });
  });
});

