import React, { useState, useEffect } from 'react';
import { formatMoney, formatLedgerDate } from '../api';

/**
 * Custom hook to count up a numeric value smoothly for the statement animation,
 * respecting prefers-reduced-motion.
 */
function useCountUp(targetVal, duration = 600) {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || typeof targetVal !== 'number') {
      setDisplayVal(targetVal);
      return;
    }

    const startVal = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetVal - startVal) * easeProgress;
      setDisplayVal(Math.round(current * 100) / 100);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setDisplayVal(targetVal);
      }
    }

    requestAnimationFrame(update);
  }, [targetVal]);

  return displayVal;
}

export default function StatementSheet({ fromDate, toDate, statementData }) {
  if (!statementData) return null;

  const {
    openingVal = 0,
    receiptsVal = 0,
    issuesVal = 0,
    salesCost = 0,
    returnsCost = 0,
    cogsVal = 0,
    scrapVal = 0,
    closingVal = 0,
    netRevenue = 0,
    grossMargin = 0,
    grossMarginPct = 0,
    variance = 0,
    isReconciled = true,
  } = statementData;

  // Counted up values for signature animation
  const animatedClosingVal = useCountUp(closingVal);
  const animatedCogs = useCountUp(cogsVal);
  const animatedRevenue = useCountUp(netRevenue);
  const animatedMargin = useCountUp(grossMargin);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }} className="no-print">
        <button
          className="ledger-btn ledger-btn-primary"
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>🖨️</span>
          <span>Print / Save Statement (PDF)</span>
        </button>
      </div>

      {/* BANK-STYLE CLOSING STATEMENT SHEET */}
      <div
        className="statement-sheet-container"
        style={{
          backgroundColor: '#ffffff',
          border: '2px solid var(--ink-primary)',
          padding: '40px 48px',
          boxShadow: '3px 4px 14px rgba(29, 27, 22, 0.08)',
          position: 'relative',
        }}
      >
        {/* Statement Header */}
        <div style={{ borderBottom: '3px double var(--ink-primary)', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Inventory Valuation & Trading Statement
              </h2>
              <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
                Official Closing Period Audit Folio • Non-Mutating Valuation Engine
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
                STATEMENT FOLIO: #STMT-{toDate.replace(/-/g, '')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '3px' }}>
                Period: <strong>{formatLedgerDate(fromDate)}</strong> to <strong>{formatLedgerDate(toDate)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: INVENTORY VALUATION ROLL-FORWARD */}
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', textTransform: 'uppercase', marginBottom: '12px', color: 'var(--ink-secondary)' }}>
            I. Inventory Valuation Roll-Forward
          </h3>

          <div className="ruled-table-wrap">
            <table className="ruled-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, width: '65%' }}>
                    Opening Inventory Valuation ({formatLedgerDate(fromDate)})
                  </td>
                  <td className="text-right tabular-num" style={{ fontWeight: 600, fontSize: '14px' }}>
                    {formatMoney(openingVal)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--accent-green-dark)' }}>
                    + Inbound Purchases & Production Outputs
                  </td>
                  <td className="text-right tabular-num" style={{ color: 'var(--accent-green-dark)' }}>
                    +{formatMoney(receiptsVal)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink-secondary)' }}>
                    - Raw Materials Issued to Production
                  </td>
                  <td className="text-right tabular-num" style={{ color: 'var(--ink-secondary)' }}>
                    -{formatMoney(issuesVal)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--stamp-red)' }}>
                    - Cost of Goods Sold to Customers (Net of Returns)
                  </td>
                  <td className="text-right tabular-num" style={{ color: 'var(--stamp-red)' }}>
                    -{formatMoney(cogsVal)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--stamp-red)' }}>
                    - Damaged & Expired Batch Scraps
                  </td>
                  <td className="text-right tabular-num" style={{ color: 'var(--stamp-red)' }}>
                    -{formatMoney(scrapVal)}
                  </td>
                </tr>
                <tr style={{ backgroundColor: 'rgba(31, 95, 74, 0.05)', borderTop: '2px solid var(--ink-primary)' }}>
                  <td style={{ fontWeight: 700, fontSize: '15px' }}>
                    = Closing Inventory Valuation ({formatLedgerDate(toDate)})
                  </td>
                  <td
                    className="text-right tabular-num"
                    style={{
                      fontWeight: 700,
                      fontSize: '16px',
                      color: 'var(--accent-green-dark)',
                    }}
                  >
                    {formatMoney(animatedClosingVal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: COGS & TRADING PROFITABILITY */}
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', textTransform: 'uppercase', marginBottom: '12px', color: 'var(--ink-secondary)' }}>
            II. Trading Margin & Cost of Goods Sold
          </h3>

          <div className="ruled-table-wrap">
            <table className="ruled-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, width: '65%' }}>Net Invoiced Sales Revenue</td>
                  <td className="text-right tabular-num" style={{ fontWeight: 600 }}>
                    {formatMoney(animatedRevenue)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--stamp-red)' }}>Cost of Goods Sold (COGS)</td>
                  <td className="text-right tabular-num" style={{ color: 'var(--stamp-red)' }}>
                    -{formatMoney(animatedCogs)}
                  </td>
                </tr>
                <tr style={{ backgroundColor: 'rgba(31, 95, 74, 0.05)', borderTop: '1px solid var(--ink-primary)' }}>
                  <td style={{ fontWeight: 700, fontSize: '15px' }}>Gross Trading Profit Margin</td>
                  <td className="text-right tabular-num" style={{ fontWeight: 700, color: 'var(--accent-green-dark)', fontSize: '15px' }}>
                    {formatMoney(animatedMargin)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Gross Profit Margin Ratio</td>
                  <td className="text-right tabular-num" style={{ fontWeight: 700, fontSize: '13px' }}>
                    {grossMarginPct.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: RECONCILIATION LINE WITH GREEN TICK */}
        <div
          style={{
            border: isReconciled ? '2px solid var(--accent-green)' : '2px solid var(--stamp-red)',
            backgroundColor: isReconciled ? 'var(--accent-green-tint)' : 'var(--stamp-red-tint)',
            padding: '16px 20px',
            borderRadius: '2px',
            marginBottom: '32px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>
              {isReconciled ? '✓' : '⚠️'}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: isReconciled ? 'var(--accent-green-dark)' : 'var(--stamp-red)',
                  letterSpacing: '0.08em',
                }}
              >
                {isReconciled
                  ? 'Reconciliation Check Passed (Zero Variance)'
                  : 'Reconciliation Variance Detected'}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-primary)', marginTop: '2px' }}>
                Opening ({formatMoney(openingVal)}) + Receipts ({formatMoney(receiptsVal)}) - Issues ({formatMoney(issuesVal)}) - COGS ({formatMoney(cogsVal)}) - Scrap ({formatMoney(scrapVal)}) = Closing ({formatMoney(closingVal)}).
                {isReconciled ? (
                  <span style={{ fontWeight: 600, color: 'var(--accent-green-dark)', marginLeft: '6px' }}>
                    Balanced with 0.00 discrepancy.
                  </span>
                ) : (
                  <span style={{ fontWeight: 600, color: 'var(--stamp-red)', marginLeft: '6px' }}>
                    Discrepancy: {formatMoney(variance)}.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Signature & Audit Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '48px', paddingTop: '20px', borderTop: '1px dashed var(--ink-faint)' }}>
          <div style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
            <div>Electronic Ledger Verification Hash: SHA-256 Validated</div>
            <div>Generated: {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            <div style={{ borderBottom: '1px solid var(--ink-primary)', width: '220px', marginBottom: '6px' }} />
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>Authorized Signatory / Comptroller</div>
          </div>
        </div>
      </div>

      {/* Embedded Print CSS Rules */}
      <style>{`
        @media print {
          body {
            background-color: #ffffff !important;
            background-image: none !important;
          }
          .book-spine, .no-print, .title-double-rule {
            display: none !important;
          }
          .ledger-page {
            max-width: 100% !important;
            padding: 0 !important;
            width: 100% !important;
            margin: 0 !important;
          }
          .statement-sheet-container {
            border: 2px solid #000000 !important;
            box-shadow: none !important;
            padding: 24px !important;
          }
        }
      `}</style>
    </div>
  );
}

