import React, { useState, useEffect } from 'react';
import { api, formatMoney, formatQty, formatLedgerDate } from '../api';
import StampBadge from '../components/StampBadge';
import { useLedger } from '../context/LedgerContext';

const MOVEMENT_TYPES = [
  'ALL',
  'RECEIPT',
  'ISSUE_PRODUCTION',
  'PRODUCTION_OUTPUT',
  'SALE',
  'SALES_RETURN',
  'SCRAP',
];

export default function Ledger() {
  const { items, highlightedMovementIds } = useLedger();

  // Filters
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal for Viewing Receipt Voucher
  const [viewingReceipt, setViewingReceipt] = useState(null);

  // Load movements from API
  const loadLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMovements({
        item_id: selectedItemId || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });

      let list = Array.isArray(data) ? data : (data.movements || []);

      // Filter by type if specified
      if (selectedType !== 'ALL') {
        list = list.filter((m) => m.movement_type === selectedType);
      }

      // Re-sort chronologically ascending to compute running balances
      const sorted = [...list].sort((a, b) => {
        const d = String(a.effective_date).localeCompare(String(b.effective_date));
        return d !== 0 ? d : Number(a.id || 0) - Number(b.id || 0);
      });

      // Compute Running Balance (Qty and Valuation)
      let runningQty = 0;
      let runningVal = 0;

      const computedRows = sorted.map((m) => {
        const q = Number(m.qty || 0);
        const v = Number(m.value || 0);
        const isOut = m.direction === 'OUT';

        if (isOut) {
          runningQty -= q;
          runningVal -= v;
        } else {
          runningQty += q;
          runningVal += v;
        }

        // Check if backdated/late entered
        const enteredDay = m.entered_date ? String(m.entered_date).slice(0, 10) : '';
        const isLateEntered = enteredDay && enteredDay > m.effective_date;

        return {
          ...m,
          runningQty: Math.round(runningQty * 10000) / 10000,
          runningVal: Math.round(runningVal * 10000) / 10000,
          isLateEntered,
          enteredDay,
        };
      });

      setMovements(computedRows);
    } catch (err) {
      setError(err.message || 'Failed to read stock ledger. Please ensure the server is running and database is initialized.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [selectedItemId, selectedType]);

  const handleReset = () => {
    setSelectedItemId('');
    setSelectedType('ALL');
    setFromDate('');
    setToDate('');
  };

  return (
    <div>
      <div className="title-double-rule">
        <h1 style={{ fontSize: '26px' }}>Stock Ledger Folio</h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Chronological journal of stock arrivals, issues, production outputs, and inventory depletion.
        </p>
      </div>

      {error && (
        <div className="ledger-ribbon-error" role="alert">
          <strong>Ledger Status Notice:</strong> {error}
          <div style={{ marginTop: '8px' }}>
            <button className="ledger-btn ledger-btn-secondary" onClick={loadLedger}>
              ↻ Retry Loading Ledger
            </button>
          </div>
        </div>
      )}

      {/* Ruled Paper Filter Strip */}
      <div className="paper-box" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '190px', flex: 1 }}>
            <label className="ledger-label">Item Filter</label>
            <select
              className="ledger-select"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
            >
              <option value="">-- All Ledger Items --</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} — {i.name} ({i.costing_method})
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '150px' }}>
            <label className="ledger-label">Movement Type</label>
            <select
              className="ledger-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '135px' }}>
            <label className="ledger-label">Effective From</label>
            <input
              type="date"
              className="ledger-input mono"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '135px' }}>
            <label className="ledger-label">Effective To</label>
            <input
              type="date"
              className="ledger-input mono"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="ledger-btn ledger-btn-primary" onClick={loadLedger} disabled={loading}>
              {loading ? 'Consulting...' : 'Filter'}
            </button>
            <button className="ledger-btn ledger-btn-secondary" onClick={handleReset} disabled={loading}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Ruled Paper Ledger Table */}
      <div className="ruled-table-wrap">
        <table className="ruled-table" aria-label="Stock ledger table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Folio #</th>
              <th style={{ width: '130px' }}>Date</th>
              <th style={{ width: '100px' }}>Type</th>
              <th>Item Description</th>
              <th className="text-right" style={{ width: '110px' }}>Qty</th>
              <th className="text-right" style={{ width: '120px' }}>Unit Cost</th>
              <th className="text-right" style={{ width: '130px' }}>Line Value</th>
              <th className="text-right" style={{ width: '120px' }}>Running Qty</th>
              <th className="text-right" style={{ width: '130px' }}>Running Value</th>
              <th style={{ width: '160px' }}>Batch & Voucher</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-muted)' }}>
                  Opening ledger folios...
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-muted)' }}>
                  No ledger entries recorded for the selected parameters.
                </td>
              </tr>
            ) : (
              movements.map((m, idx) => {
                const isAffected = highlightedMovementIds.has(String(m.id));
                const isOut = m.direction === 'OUT';

                return (
                  <tr
                    key={m.id}
                    className={`animate-ink-in ${isAffected ? 'ripple-affected' : ''}`}
                    style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}
                  >
                    {/* Folio ID */}
                    <td className="tabular-num" style={{ color: 'var(--ink-muted)', fontSize: '12px' }}>
                      #{m.id}
                    </td>

                    {/* Date with Late Entered annotation */}
                    <td>
                      <div className="tabular-num" style={{ fontWeight: 600 }}>
                        {formatLedgerDate(m.effective_date)}
                      </div>
                      {m.isLateEntered && (
                        <div
                          style={{
                            fontSize: '10.5px',
                            color: 'var(--stamp-red)',
                            fontFamily: 'var(--font-mono)',
                            marginTop: '2px',
                          }}
                        >
                          entered {formatLedgerDate(m.enteredDay)}
                        </div>
                      )}
                    </td>

                    {/* Rubber Stamp Badge */}
                    <td>
                      <StampBadge type={m.movement_type} />
                    </td>

                    {/* Item */}
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.item_code || ''}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)' }}>
                        {m.item_name || ''}
                      </div>
                    </td>

                    {/* Qty */}
                    <td
                      className="text-right tabular-num"
                      style={{
                        fontWeight: 600,
                        color: isOut ? 'var(--ink-primary)' : 'var(--accent-green-dark)',
                      }}
                    >
                      {isOut ? `-${formatQty(m.qty)}` : `+${formatQty(m.qty)}`}
                    </td>

                    {/* Unit Cost */}
                    <td className="text-right tabular-num" style={{ color: 'var(--ink-secondary)' }}>
                      {m.unit_cost !== null && m.unit_cost !== undefined
                        ? formatMoney(m.unit_cost)
                        : '—'}
                    </td>

                    {/* Value */}
                    <td className="text-right tabular-num" style={{ fontWeight: 600 }}>
                      {m.value !== null && m.value !== undefined ? formatMoney(m.value) : '—'}
                    </td>

                    {/* Running Qty */}
                    <td
                      className="text-right tabular-num"
                      style={{
                        backgroundColor: 'rgba(29, 27, 22, 0.02)',
                        fontWeight: 600,
                      }}
                    >
                      {formatQty(m.runningQty)}
                    </td>

                    {/* Running Value */}
                    <td
                      className="text-right tabular-num"
                      style={{
                        backgroundColor: 'rgba(29, 27, 22, 0.02)',
                        color: 'var(--accent-green-dark)',
                        fontWeight: 700,
                      }}
                    >
                      {formatMoney(m.runningVal)}
                    </td>

                    {/* Batch & Receipt Voucher */}
                    <td>
                      {m.batch_no && (
                        <div style={{ fontSize: '12px' }}>
                          Batch: <strong>{m.batch_no}</strong>
                        </div>
                      )}
                      {m.expiry_date && (
                        <div style={{ fontSize: '11px', color: 'var(--stamp-red)' }}>
                          Exp: {formatLedgerDate(m.expiry_date)}
                        </div>
                      )}
                      {m.receipt_data ? (
                        <button
                          type="button"
                          className="ledger-btn ledger-btn-secondary"
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            marginTop: '4px',
                            backgroundColor: 'var(--accent-green-tint)',
                            borderColor: 'var(--accent-green)',
                            color: 'var(--accent-green-dark)',
                          }}
                          onClick={() => setViewingReceipt(m)}
                        >
                          🧾 View Receipt
                        </button>
                      ) : !m.batch_no && !m.expiry_date ? (
                        <span style={{ color: 'var(--ink-muted)' }}>—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog for Viewing Receipt Attachment */}
      {viewingReceipt && (
        <div className="ledger-modal-backdrop" onClick={() => setViewingReceipt(null)}>
          <div className="ledger-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ledger-modal-header">
              <div>
                <h3 style={{ fontSize: '18px', margin: 0 }}>
                  🧾 Folio #{viewingReceipt.id} Receipt Voucher
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                  {viewingReceipt.item_code} • {viewingReceipt.movement_type} on {formatLedgerDate(viewingReceipt.effective_date)}
                </div>
              </div>
              <button
                type="button"
                className="ledger-btn ledger-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setViewingReceipt(null)}
              >
                ✕ Close
              </button>
            </div>

            <div className="ledger-modal-body" style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  padding: '10px 16px',
                  background: 'var(--paper-card-highlight)',
                  border: '1px solid var(--paper-rule-strong)',
                  marginBottom: '16px',
                  borderRadius: '2px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--ink-muted)' }}>Quantity: </span>
                  <strong>{formatQty(viewingReceipt.qty)} {viewingReceipt.unit}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-muted)' }}>Unit Cost: </span>
                  <strong>{formatMoney(viewingReceipt.unit_cost)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-muted)' }}>Total Value: </span>
                  <strong style={{ color: 'var(--accent-green-dark)' }}>{formatMoney(viewingReceipt.value)}</strong>
                </div>
              </div>

              {viewingReceipt.receipt_data?.startsWith('data:image/') ? (
                <div style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <img
                    src={viewingReceipt.receipt_data}
                    alt={`Receipt voucher for Folio #${viewingReceipt.id}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '52vh',
                      objectFit: 'contain',
                      border: '1px solid var(--paper-rule-strong)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              ) : (
                <div style={{ padding: '30px', background: '#fff', border: '1px solid var(--paper-rule-strong)' }}>
                  <div style={{ fontSize: '42px', marginBottom: '12px' }}>📄</div>
                  <h4>Document Attachment</h4>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '16px' }}>
                    Uploaded electronic document voucher for Folio #{viewingReceipt.id}.
                  </p>
                  <a
                    href={viewingReceipt.receipt_data}
                    download={`folio_${viewingReceipt.id}_voucher.pdf`}
                    className="ledger-btn ledger-btn-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    ⬇️ Download Attached Document
                  </a>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--paper-rule-strong)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: 'var(--paper-card-highlight)',
              }}
            >
              {viewingReceipt.receipt_data?.startsWith('data:image/') && (
                <a
                  href={viewingReceipt.receipt_data}
                  download={`folio_${viewingReceipt.id}_receipt.png`}
                  className="ledger-btn ledger-btn-secondary"
                  style={{ textDecoration: 'none', fontSize: '12px' }}
                >
                  ⬇️ Download Receipt Image
                </a>
              )}
              <button
                type="button"
                className="ledger-btn ledger-btn-primary"
                style={{ fontSize: '12px' }}
                onClick={() => setViewingReceipt(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
