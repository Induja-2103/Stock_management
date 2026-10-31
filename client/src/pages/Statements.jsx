import React, { useState, useEffect } from 'react';
import { api, round4 } from '../api';
import ExpiryStrip from '../components/ExpiryStrip';
import StatementSheet from '../components/StatementSheet';

export default function Statements() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;

  const [fromDate, setFromDate] = useState(startOfMonthStr);
  const [toDate, setToDate] = useState(todayStr);

  const [statementData, setStatementData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load and reconcile statement
  const generateStatement = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch COGS report
      const cogsRes = await api.getCogs(fromDate, toDate);

      // 2. Fetch Opening valuation (as of day before fromDate)
      const dayBefore = new Date(new Date(fromDate).getTime() - 86400000).toISOString().slice(0, 10);
      const [openingRes, closingRes, movementsRes] = await Promise.all([
        api.getValuation(dayBefore),
        api.getValuation(toDate),
        api.getMovements({ from: fromDate, to: toDate }),
      ]);

      const openingVal = openingRes.totalValuation || 0;
      const closingVal = closingRes.totalValuation || 0;

      let receiptsVal = 0;
      let issuesVal = 0;
      let scrapVal = 0;

      const mList = Array.isArray(movementsRes) ? movementsRes : (movementsRes.movements || []);
      for (const m of mList) {
        const val = Number(m.value || 0);
        if (m.movement_type === 'RECEIPT' || m.movement_type === 'PRODUCTION_OUTPUT') {
          receiptsVal += val;
        } else if (m.movement_type === 'ISSUE_PRODUCTION') {
          issuesVal += val;
        } else if (m.movement_type === 'SCRAP') {
          scrapVal += val;
        }
      }

      const cogsVal = cogsRes.cogs || 0;
      const netRevenue = cogsRes.revenue || 0;
      const grossMargin = cogsRes.grossMargin || 0;
      const grossMarginPct = cogsRes.grossMarginPercentage || 0;

      // Reconciliation equation: Opening + Receipts - Issues - COGS - Scrap = Closing
      const expectedClosing = openingVal + receiptsVal - issuesVal - cogsVal - scrapVal;
      const variance = Math.round((closingVal - expectedClosing) * 10000) / 10000;
      const isReconciled = Math.abs(variance) < 0.05;

      setStatementData({
        openingVal: round4(openingVal),
        receiptsVal: round4(receiptsVal),
        issuesVal: round4(issuesVal),
        salesCost: round4(cogsRes.salesCost || 0),
        returnsCost: round4(cogsRes.salesReturnCost || 0),
        cogsVal: round4(cogsVal),
        scrapVal: round4(scrapVal),
        closingVal: round4(closingVal),
        netRevenue: round4(netRevenue),
        grossMargin: round4(grossMargin),
        grossMarginPct,
        variance,
        isReconciled,
      });
    } catch (err) {
      setError(err.message || 'Failed to generate financial statement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateStatement();
  }, []);

  return (
    <div>
      <div className="title-double-rule">
        <h1 style={{ fontSize: '26px' }}>Statements & Valuation Reports</h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Period-end financial closing, batch shelf-life countdowns, and mathematical inventory reconciliation.
        </p>
      </div>

      {error && (
        <div className="ledger-ribbon-error" role="alert">
          <strong>Statement Error:</strong> {error}
        </div>
      )}

      {/* SIGNATURE FEATURE: Horizontal Batch Expiry Strip */}
      <ExpiryStrip onWriteoffComplete={generateStatement} />

      {/* Statement Period Picker */}
      <div className="paper-box no-print" style={{ padding: '16px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label className="ledger-label">Statement Period From</label>
            <input
              type="date"
              className="ledger-input mono"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div>
            <label className="ledger-label">Statement Period To</label>
            <input
              type="date"
              className="ledger-input mono"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <button
            className="ledger-btn ledger-btn-primary"
            onClick={generateStatement}
            disabled={loading}
          >
            {loading ? 'Reconciling Ledger...' : 'Compile Period Statement'}
          </button>
        </div>
      </div>

      {/* SIGNATURE FEATURE: Bank-Style Printable Month-End Statement */}
      {loading ? (
        <div className="paper-box" style={{ textAlign: 'center', padding: '48px', color: 'var(--ink-muted)' }}>
          Computing rolling balances and reconciling inventory accounts...
        </div>
      ) : statementData ? (
        <StatementSheet
          fromDate={fromDate}
          toDate={toDate}
          statementData={statementData}
        />
      ) : null}
    </div>
  );
}

