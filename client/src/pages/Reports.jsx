import React, { useState, useEffect } from 'react';

export default function Reports() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfYearStr = `${new Date().getFullYear()}-01-01`;

  // Active Report Tab
  const [activeTab, setActiveTab] = useState('valuation'); // 'valuation' | 'cogs'

  // Valuation state
  const [valuationDate, setValuationDate] = useState(todayStr);
  const [valuationData, setValuationData] = useState(null);
  const [loadingValuation, setLoadingValuation] = useState(false);

  // COGS state
  const [cogsFrom, setCogsFrom] = useState(startOfYearStr);
  const [cogsTo, setCogsTo] = useState(todayStr);
  const [cogsData, setCogsData] = useState(null);
  const [loadingCogs, setLoadingCogs] = useState(false);

  // Reconciliation state
  const [reconData, setReconData] = useState(null);
  const [loadingRecon, setLoadingRecon] = useState(false);

  // Expiry write-off state
  const [expiryDate, setExpiryDate] = useState(todayStr);
  const [runningWriteoff, setRunningWriteoff] = useState(false);
  const [writeoffResult, setWriteoffResult] = useState(null);

  // Common errors
  const [error, setError] = useState(null);

  // Fetch Valuation
  const fetchValuation = async (date) => {
    setLoadingValuation(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/valuation?asOf=${date || valuationDate}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to fetch valuation report');
      }
      const data = await res.json();
      setValuationData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingValuation(false);
    }
  };

  // Fetch COGS & Reconciliation
  const fetchCogsAndRecon = async () => {
    setLoadingCogs(true);
    setLoadingRecon(true);
    setError(null);

    try {
      // 1. Fetch COGS
      const res = await fetch(`/api/reports/cogs?from=${cogsFrom}&to=${cogsTo}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to fetch COGS report');
      }
      const data = await res.json();
      setCogsData(data);

      // 2. Compute Reconciliation:
      // Opening Valuation (asOf day before from)
      const dayBeforeFrom = new Date(new Date(cogsFrom).getTime() - 86400000).toISOString().slice(0, 10);
      const [openingRes, closingRes, movementsRes] = await Promise.all([
        fetch(`/api/reports/valuation?asOf=${dayBeforeFrom}`).then(r => r.json()),
        fetch(`/api/reports/valuation?asOf=${cogsTo}`).then(r => r.json()),
        fetch(`/api/movements?from=${cogsFrom}&to=${cogsTo}`).then(r => r.json()),
      ]);

      const openingVal = openingRes.totalValuation || 0;
      const closingVal = closingRes.totalValuation || 0;

      let receiptsValue = 0;
      let scrapValue = 0;

      const mList = Array.isArray(movementsRes) ? movementsRes : (movementsRes.movements || []);
      for (const m of mList) {
        const val = Number(m.value || 0);
        if (m.movement_type === 'RECEIPT' || m.movement_type === 'PRODUCTION_OUTPUT') {
          receiptsValue += val;
        } else if (m.movement_type === 'SCRAP' || m.movement_type === 'ISSUE_PRODUCTION') {
          scrapValue += val;
        }
      }

      const cogsVal = data.cogs || 0;
      const expectedClosing = openingVal + receiptsValue - cogsVal - scrapValue;
      const variance = Math.round((closingVal - expectedClosing) * 10000) / 10000;

      setReconData({
        openingVal: Math.round(openingVal * 100) / 100,
        receiptsValue: Math.round(receiptsValue * 100) / 100,
        cogsVal: Math.round(cogsVal * 100) / 100,
        scrapValue: Math.round(scrapValue * 100) / 100,
        closingVal: Math.round(closingVal * 100) / 100,
        expectedClosing: Math.round(expectedClosing * 100) / 100,
        variance,
        isBalanced: Math.abs(variance) < 0.05,
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCogs(false);
      setLoadingRecon(false);
    }
  };

  // Run Expiry Write-Off
  const handleExpiryWriteoff = async () => {
    if (!window.confirm(`Run expiry write-off for batches expired on or before ${expiryDate}? This will insert SCRAP rows for any remaining stock.`)) {
      return;
    }

    setRunningWriteoff(true);
    setWriteoffResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/expiry/writeoff?asOf=${expiryDate}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Expiry write-off failed');
      }

      setWriteoffResult(data);
      // Refresh current active reports
      fetchValuation(valuationDate);
      if (activeTab === 'cogs') {
        fetchCogsAndRecon();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningWriteoff(false);
    }
  };

  useEffect(() => {
    fetchValuation(valuationDate);
    fetchCogsAndRecon();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Finance & Valuation Reports</h1>
          <p>Real-time inventory valuation as of any date, COGS periodic reporting, and audit reconciliation.</p>
        </div>

        {/* Expiry Action Button in Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="date"
            className="form-control"
            style={{ width: '150px' }}
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
          <button
            className="btn btn-danger"
            onClick={handleExpiryWriteoff}
            disabled={runningWriteoff}
          >
            {runningWriteoff ? 'Processing...' : 'Run Expiry Write-Off'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <div className="banner-title">⚠️ Error</div>
          <div>{error}</div>
        </div>
      )}

      {/* Expiry Write-off Result Banner */}
      {writeoffResult && (
        <div className={`alert ${writeoffResult.count > 0 ? 'alert-warning' : 'alert-info'}`}>
          <div className="banner-title">
            <span>📦 Expiry Write-Off Execution ({writeoffResult.asOf})</span>
          </div>
          <div>{writeoffResult.message}</div>
          {writeoffResult.count > 0 && (
            <table className="changed-costs-table" style={{ marginTop: '10px' }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Batch No</th>
                  <th>Expiry Date</th>
                  <th className="text-right">Scrapped Qty</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {writeoffResult.writtenOff.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.item_code}</strong> - {b.item_name}</td>
                    <td><strong>{b.batch_no}</strong></td>
                    <td>{b.expiry_date}</td>
                    <td className="text-right font-mono">{Number(b.qty).toFixed(4)}</td>
                    <td>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'valuation' ? 'active' : ''}`}
          onClick={() => setActiveTab('valuation')}
        >
          Inventory Valuation
        </button>
        <button
          className={`tab-btn ${activeTab === 'cogs' ? 'active' : ''}`}
          onClick={() => setActiveTab('cogs')}
        >
          COGS & Profit Margins
        </button>
      </div>

      {/* TAB 1: Valuation */}
      {activeTab === 'valuation' && (
        <div>
          {/* Controls */}
          <div className="filter-bar">
            <div className="form-group">
              <label className="form-label">Valuation As Of Date</label>
              <input
                type="date"
                className="form-control"
                value={valuationDate}
                onChange={(e) => setValuationDate(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => fetchValuation(valuationDate)}
              disabled={loadingValuation}
            >
              {loadingValuation ? 'Calculating...' : 'Calculate Valuation'}
            </button>
          </div>

          {/* Metric Cards */}
          <div className="grid-3" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-label">Total Inventory Valuation</div>
              <div className="stat-value" style={{ color: '#047857' }}>
                ${Number(valuationData?.totalValuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-sub">As of {valuationDate}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Catalog Items Tracked</div>
              <div className="stat-value">{valuationData?.itemCount || 0}</div>
              <div className="stat-sub">Total distinct items</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Items with Active Stock</div>
              <div className="stat-value" style={{ color: '#2563eb' }}>
                {valuationData?.itemsWithStock || 0}
              </div>
              <div className="stat-sub">Quantity on hand &gt; 0</div>
            </div>
          </div>

          {/* Item Breakdown Table */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Unit</th>
                    <th>Costing Method</th>
                    <th className="text-right">Qty on Hand</th>
                    <th className="text-right">Avg Unit Cost</th>
                    <th className="text-right">Total Valuation</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingValuation ? (
                    <tr>
                      <td colSpan="7" className="text-center" style={{ padding: '32px' }}>
                        Replaying ledger and calculating stock valuations...
                      </td>
                    </tr>
                  ) : !valuationData?.items || valuationData.items.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center" style={{ padding: '32px' }}>
                        No items found in inventory.
                      </td>
                    </tr>
                  ) : (
                    valuationData.items.map((i) => (
                      <tr key={i.id}>
                        <td><strong>{i.code}</strong></td>
                        <td>{i.name}</td>
                        <td>{i.unit}</td>
                        <td>
                          <span className={`badge ${i.costing_method === 'FIFO' ? 'badge-fifo' : 'badge-wac'}`}>
                            {i.costing_method}
                          </span>
                        </td>
                        <td className="text-right font-mono" style={{ fontWeight: 600 }}>
                          {Number(i.qty).toFixed(4)}
                        </td>
                        <td className="text-right font-mono">
                          ${Number(i.unit_cost).toFixed(4)}
                        </td>
                        <td className="text-right font-mono" style={{ fontWeight: 700, color: '#047857' }}>
                          ${Number(i.total_value).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COGS & Profitability */}
      {activeTab === 'cogs' && (
        <div>
          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="form-group">
              <label className="form-label">Period From</label>
              <input
                type="date"
                className="form-control"
                value={cogsFrom}
                onChange={(e) => setCogsFrom(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Period To</label>
              <input
                type="date"
                className="form-control"
                value={cogsTo}
                onChange={(e) => setCogsTo(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={fetchCogsAndRecon} disabled={loadingCogs}>
              {loadingCogs ? 'Generating...' : 'Generate COGS Report'}
            </button>
          </div>

          {/* Metric Cards */}
          <div className="grid-4" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-label">Net Sales Revenue</div>
              <div className="stat-value" style={{ color: '#2563eb' }}>
                ${Number(cogsData?.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-sub">Sales minus sales returns</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Cost of Goods Sold (COGS)</div>
              <div className="stat-value" style={{ color: '#b91c1c' }}>
                ${Number(cogsData?.cogs || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-sub">Sale costs minus return costs</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Gross Margin ($)</div>
              <div className="stat-value" style={{ color: '#047857' }}>
                ${Number(cogsData?.grossMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-sub">Revenue minus COGS</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Gross Margin (%)</div>
              <div className="stat-value">
                {Number(cogsData?.grossMarginPercentage || 0).toFixed(2)}%
              </div>
              <div className="stat-sub">Margin ratio</div>
            </div>
          </div>

          {/* Reconciliation Line Section */}
          <div className="recon-box">
            <h3 style={{ color: '#065f46', fontSize: '16px', fontWeight: 700 }}>
              Audit Inventory Reconciliation Formula
            </h3>
            <p style={{ fontSize: '13px', color: '#047857', marginTop: '4px' }}>
              Verifies stock ledger integrity across period: Opening + Inflows - COGS - Scraps = Closing
            </p>

            {loadingRecon ? (
              <p style={{ marginTop: '12px', color: '#047857' }}>Calculating reconciliation balance...</p>
            ) : reconData ? (
              <div>
                <div className="recon-formula">
                  <div className="recon-item">
                    <span className="recon-item-val">${reconData.openingVal.toLocaleString()}</span>
                    <span className="recon-item-lbl">Opening Valuation</span>
                  </div>
                  <span className="recon-op">+</span>
                  <div className="recon-item">
                    <span className="recon-item-val">${reconData.receiptsValue.toLocaleString()}</span>
                    <span className="recon-item-lbl">Receipts / Output</span>
                  </div>
                  <span className="recon-op">-</span>
                  <div className="recon-item">
                    <span className="recon-item-val" style={{ color: '#b91c1c' }}>
                      ${reconData.cogsVal.toLocaleString()}
                    </span>
                    <span className="recon-item-lbl">COGS (Sales)</span>
                  </div>
                  <span className="recon-op">-</span>
                  <div className="recon-item">
                    <span className="recon-item-val" style={{ color: '#b91c1c' }}>
                      ${reconData.scrapValue.toLocaleString()}
                    </span>
                    <span className="recon-item-lbl">Scrap / Production</span>
                  </div>
                  <span className="recon-op">=</span>
                  <div className="recon-item">
                    <span className="recon-item-val" style={{ color: '#047857' }}>
                      ${reconData.closingVal.toLocaleString()}
                    </span>
                    <span className="recon-item-lbl">Closing Valuation</span>
                  </div>
                </div>

                <div style={{ marginTop: '14px', fontSize: '13px', fontWeight: 600, textAlign: 'center', color: reconData.isBalanced ? '#15803d' : '#b91c1c' }}>
                  {reconData.isBalanced
                    ? '✓ Inventory perfectly reconciled. Zero variance detected.'
                    : `⚠️ Variance detected: $${reconData.variance.toFixed(2)}`}
                </div>
              </div>
            ) : null}
          </div>

          {/* Item Breakdown Table */}
          <div className="card" style={{ marginTop: '24px', padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px' }}>Item COGS Breakdown</h3>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Method</th>
                    <th className="text-right">Sales Cost</th>
                    <th className="text-right">Return Cost</th>
                    <th className="text-right">Net COGS</th>
                    <th className="text-right">Net Revenue</th>
                    <th className="text-right">Gross Margin</th>
                    <th className="text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {!cogsData?.items || cogsData.items.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>
                        No sales transactions in the selected period.
                      </td>
                    </tr>
                  ) : (
                    cogsData.items.map((i) => (
                      <tr key={i.item_id}>
                        <td><strong>{i.code}</strong></td>
                        <td>{i.name}</td>
                        <td>
                          <span className={`badge ${i.costing_method === 'FIFO' ? 'badge-fifo' : 'badge-wac'}`}>
                            {i.costing_method}
                          </span>
                        </td>
                        <td className="text-right font-mono">${Number(i.sale_cost).toFixed(2)}</td>
                        <td className="text-right font-mono">${Number(i.sales_return_cost).toFixed(2)}</td>
                        <td className="text-right font-mono" style={{ fontWeight: 600 }}>${Number(i.cogs).toFixed(2)}</td>
                        <td className="text-right font-mono">${Number(i.revenue).toFixed(2)}</td>
                        <td className="text-right font-mono" style={{ fontWeight: 600, color: '#047857' }}>
                          ${Number(i.gross_margin).toFixed(2)}
                        </td>
                        <td className="text-right font-mono">{Number(i.gross_margin_pct).toFixed(2)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

