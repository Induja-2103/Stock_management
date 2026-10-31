import React from 'react';
import { formatMoney, formatQty, formatLedgerDate, round4 } from '../api';

/**
 * Replays movements to calculate active remaining FIFO layers or WAC average.
 */
function computeFIFOLayers(movements) {
  const layers = [];
  const salesMap = new Map();

  const sorted = [...movements].sort((a, b) => {
    const d = String(a.effective_date).localeCompare(String(b.effective_date));
    return d !== 0 ? d : Number(a.id || 0) - Number(b.id || 0);
  });

  for (const m of sorted) {
    const qty = round4(m.qty);
    const mType = (m.movement_type || '').toUpperCase();
    const isOut = m.direction === 'OUT';
    const isReturn = mType === 'SALES_RETURN';

    if (isReturn) {
      let retCost = 0;
      if (m.ref_sale_id && salesMap.has(String(m.ref_sale_id))) {
        retCost = salesMap.get(String(m.ref_sale_id));
      } else {
        retCost = round4(m.unit_cost || 0);
      }
      layers.push({
        id: m.id,
        origQty: qty,
        remainingQty: qty,
        cost: retCost,
        date: m.effective_date,
        batch_no: m.batch_no,
        type: 'RETURN',
      });
    } else if (isOut) {
      let toConsume = qty;
      let totalCostConsumed = 0;

      for (let i = 0; i < layers.length && toConsume > 0.0001; i++) {
        const lyr = layers[i];
        if (lyr.remainingQty <= 0.0001) continue;

        if (lyr.remainingQty <= toConsume + 0.0001) {
          totalCostConsumed += lyr.remainingQty * lyr.cost;
          toConsume = round4(toConsume - lyr.remainingQty);
          lyr.remainingQty = 0;
        } else {
          totalCostConsumed += toConsume * lyr.cost;
          lyr.remainingQty = round4(lyr.remainingQty - toConsume);
          toConsume = 0;
        }
      }

      if (mType === 'SALE' && m.id) {
        const unitCost = round4(totalCostConsumed / qty);
        salesMap.set(String(m.id), unitCost);
      }
    } else {
      // RECEIPT or PRODUCTION_OUTPUT
      const cost = round4(m.unit_cost || 0);
      layers.push({
        id: m.id,
        origQty: qty,
        remainingQty: qty,
        cost,
        date: m.effective_date,
        batch_no: m.batch_no,
        type: mType,
      });
    }
  }

  // Filter only active remaining layers
  return layers.filter((l) => l.remainingQty > 0.0001);
}

export default function LayerStack({ item, movements = [], closingQty = 0, closingValue = 0 }) {
  if (!item) return null;

  const isFIFO = item.costing_method === 'FIFO';
  const activeLayers = isFIFO ? computeFIFOLayers(movements) : [];
  const maxLayerQty = activeLayers.length > 0 ? Math.max(...activeLayers.map((l) => l.remainingQty)) : 1;
  const avgCost = closingQty > 0 ? closingValue / closingQty : 0;

  return (
    <div className="paper-box" style={{ marginTop: '20px' }}>
      <div className="paper-box-title">
        <div>
          <span>Cost Layer Architecture</span>
          <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--ink-secondary)', marginLeft: '10px' }}>
            [{item.costing_method}] {item.code} — {item.name}
          </span>
        </div>
        <div className="tabular-num" style={{ fontSize: '14px', color: 'var(--accent-green-dark)' }}>
          Total Value: {formatMoney(closingValue)} ({formatQty(closingQty)} {item.unit})
        </div>
      </div>

      {isFIFO ? (
        /* FIFO VERTICAL LAYER STACK */
        <div>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginBottom: '16px' }}>
            Active inventory layers in order of acquisition. Outgoing issues shave from the oldest layer first.
          </p>

          {activeLayers.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
              No active layers in stock. Current inventory is zero.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeLayers.map((layer, index) => {
                const widthPct = Math.max(25, Math.min(100, Math.round((layer.remainingQty / maxLayerQty) * 100)));
                const layerValue = layer.remainingQty * layer.cost;

                return (
                  <div key={layer.id || index} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-secondary)' }}>
                      <span>
                        <strong>Layer {index + 1}</strong> — Acquired {formatLedgerDate(layer.date)}
                        {layer.batch_no && <span> (Batch: {layer.batch_no})</span>}
                      </span>
                      <span className="tabular-num">
                        Unit Cost: <strong>{formatMoney(layer.cost)}</strong> | Layer Value: {formatMoney(layerValue)}
                      </span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(29, 27, 22, 0.05)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          backgroundColor: index === 0 ? 'var(--accent-green)' : 'rgba(31, 95, 74, 0.75)',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 12px',
                          color: '#ffffff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          fontWeight: 600,
                          transition: 'width 0.4s ease',
                          whiteSpace: 'nowrap',
                          boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.2)',
                        }}
                      >
                        {formatQty(layer.remainingQty)} {item.unit} remaining
                        {index === 0 && ' (Oldest Layer - Next to Issue)'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* WAC SINGLE BAR WITH MOVING AVERAGE LINE */
        <div>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginBottom: '16px' }}>
            Unified inventory pool with weighted average cost recalculated on each receipt.
          </p>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'rgba(29, 27, 22, 0.02)',
              border: '1px solid var(--paper-rule-strong)',
              borderRadius: '3px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Total Pool Stock</span>
              <span className="tabular-num" style={{ fontWeight: 700 }}>
                {formatQty(closingQty)} {item.unit}
              </span>
            </div>

            {/* Visual Bar */}
            <div
              style={{
                width: '100%',
                height: '36px',
                backgroundColor: 'rgba(180, 83, 9, 0.12)',
                borderRadius: '3px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                border: '1px solid rgba(180, 83, 9, 0.3)',
              }}
            >
              <div
                style={{
                  width: closingQty > 0 ? '100%' : '0%',
                  height: '100%',
                  backgroundColor: 'rgba(180, 83, 9, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 16px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--stamp-amber)',
                }}
              >
                Stock on Hand: {formatQty(closingQty)} {item.unit}
              </div>

              {/* Moving average line overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: '2px',
                  backgroundColor: 'var(--stamp-amber)',
                  boxShadow: '0 0 6px rgba(180, 83, 9, 0.5)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px' }}>
              <span>
                Moving Average Unit Cost:{' '}
                <strong className="tabular-num" style={{ color: 'var(--stamp-amber)', fontFamily: 'var(--font-mono)' }}>
                  {formatMoney(avgCost)}
                </strong>
              </span>
              <span>
                Total Portfolio Value:{' '}
                <strong className="tabular-num" style={{ color: 'var(--accent-green-dark)', fontFamily: 'var(--font-mono)' }}>
                  {formatMoney(closingValue)}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

