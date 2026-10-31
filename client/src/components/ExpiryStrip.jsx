import React, { useState, useEffect } from 'react';
import { api, formatQty, formatLedgerDate } from '../api';

export default function ExpiryStrip({ onWriteoffComplete }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  const [writeoffResult, setWriteoffResult] = useState(null);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Load batch movements to compute remaining batch balances
  const loadBatches = async () => {
    setLoading(true);
    try {
      const data = await api.getMovements();
      const movements = Array.isArray(data) ? data : (data.movements || []);

      // Group by item_id + batch_no + expiry_date
      const batchMap = new Map();

      for (const m of movements) {
        if (!m.batch_no || !m.expiry_date) continue;
        const key = `${m.item_id}_${m.batch_no}_${m.expiry_date}`;
        const q = Number(m.qty || 0);
        const signedQty = m.direction === 'IN' ? q : -q;

        if (!batchMap.has(key)) {
          batchMap.set(key, {
            item_id: m.item_id,
            item_code: m.item_code || `Item #${m.item_id}`,
            item_name: m.item_name || '',
            unit: m.unit || 'units',
            batch_no: m.batch_no,
            expiry_date: m.expiry_date,
            remainingQty: signedQty,
          });
        } else {
          const b = batchMap.get(key);
          b.remainingQty = Math.round((b.remainingQty + signedQty) * 10000) / 10000;
        }
      }

      // Keep only batches with remaining inventory > 0
      const activeBatches = Array.from(batchMap.values())
        .filter((b) => b.remainingQty > 0.0001)
        .map((b) => {
          const expTime = new Date(b.expiry_date).getTime();
          const diffDays = Math.ceil((expTime - today.getTime()) / (1000 * 60 * 60 * 24));
          return {
            ...b,
            diffDays,
            isExpired: diffDays <= 0,
            isCritical: diffDays > 0 && diffDays <= 30,
          };
        })
        .sort((a, b) => a.diffDays - b.diffDays);

      setBatches(activeBatches);
    } catch (err) {
      console.error('Error loading batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const expiredBatches = batches.filter((b) => b.isExpired);

  const handleExecuteWriteoff = async () => {
    setWritingOff(true);
    try {
      const res = await api.writeoffExpiry(todayStr);
      setWriteoffResult(res);
      setShowConfirm(false);
      await loadBatches();
      if (onWriteoffComplete) {
        onWriteoffComplete();
      }
    } catch (err) {
      alert(`Write-off execution failed: ${err.message}`);
    } finally {
      setWritingOff(false);
    }
  };

  return (
    <div className="paper-box" style={{ marginBottom: '28px' }}>
      <div className="paper-box-title">
        <div>
          <span>Batch Expiry Strip & Chronology</span>
          <span style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginLeft: '10px' }}>
            Horizontal shelf-life tracking for perishable lots
          </span>
        </div>

        <button
          className="ledger-btn ledger-btn-danger"
          style={{ fontSize: '11px', padding: '6px 12px' }}
          disabled={expiredBatches.length === 0}
          onClick={() => setShowConfirm(true)}
        >
          Write Off Expired Stock ({expiredBatches.length})
        </button>
      </div>

      {writeoffResult && (
        <div className="ledger-ribbon-success" style={{ marginBottom: '14px', fontSize: '12px' }}>
          ✓ {writeoffResult.message}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Scanning batch ledgers...</p>
      ) : batches.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
          No active perishable batches recorded in current stock.
        </p>
      ) : (
        /* HORIZONTAL SCROLLABLE TIMELINE STRIP */
        <div
          style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '8px',
          }}
        >
          {batches.map((b) => {
            let chipBg = 'var(--accent-green-tint)';
            let chipColor = 'var(--accent-green)';
            let chipBorder = 'var(--accent-green)';
            let statusText = `${b.diffDays}d left`;

            if (b.isExpired) {
              chipBg = 'var(--stamp-red-tint)';
              chipColor = 'var(--stamp-red)';
              chipBorder = 'var(--stamp-red)';
              statusText = `EXPIRED (${Math.abs(b.diffDays)}d ago)`;
            } else if (b.isCritical) {
              chipBg = 'var(--stamp-amber-tint)';
              chipColor = 'var(--stamp-amber)';
              chipBorder = 'var(--stamp-amber)';
              statusText = `CRITICAL (${b.diffDays}d left)`;
            }

            return (
              <div
                key={`${b.item_id}_${b.batch_no}`}
                style={{
                  minWidth: '220px',
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--paper-rule-strong)',
                  borderRadius: '3px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  boxShadow: '1px 1px 4px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>{b.batch_no}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '2px',
                      backgroundColor: chipBg,
                      color: chipColor,
                      border: `1px solid ${chipBorder}`,
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {statusText}
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)' }}>
                  {b.item_code} — {b.item_name}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>Expiry: {formatLedgerDate(b.expiry_date)}</span>
                  <span className="tabular-num" style={{ fontWeight: 600 }}>
                    {formatQty(b.remainingQty)} {b.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION DIALOG LISTING EXACTLY WHAT WILL BE SCRAPPED */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(29, 27, 22, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="paper-box"
            style={{
              maxWidth: '600px',
              width: '100%',
              backgroundColor: '#ffffff',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--stamp-red)', fontSize: '20px' }}>
              Confirm Expiry Write-Off
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', marginTop: '8px' }}>
              The following batches have passed their expiration date and hold remaining stock.
              Executing write-off will append permanent <strong>SCRAP</strong> entries to the ledger.
            </p>

            <div className="ruled-table-wrap" style={{ margin: '18px 0', maxHeight: '220px', overflowY: 'auto' }}>
              <table className="ruled-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Item</th>
                    <th>Expired On</th>
                    <th className="text-right">Scrap Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredBatches.map((b) => (
                    <tr key={b.batch_no}>
                      <td><strong>{b.batch_no}</strong></td>
                      <td>{b.item_code}</td>
                      <td>{formatLedgerDate(b.expiry_date)}</td>
                      <td className="text-right tabular-num" style={{ fontWeight: 600, color: 'var(--stamp-red)' }}>
                        {formatQty(b.remainingQty)} {b.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="ledger-btn ledger-btn-secondary"
                onClick={() => setShowConfirm(false)}
                disabled={writingOff}
              >
                Cancel
              </button>
              <button
                className="ledger-btn ledger-btn-danger"
                onClick={handleExecuteWriteoff}
                disabled={writingOff}
              >
                {writingOff ? 'Inscribing SCRAP rows...' : `Confirm Write-Off (${expiredBatches.length} Batches)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

