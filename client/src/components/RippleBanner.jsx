import React from 'react';
import { formatMoney, formatLedgerDate } from '../api';
import StampBadge from './StampBadge';

export default function RippleBanner({ rippleData, onDismiss }) {
  if (!rippleData || !rippleData.changedCosts || rippleData.changedCosts.length === 0) {
    return null;
  }

  const { changedCosts, movement } = rippleData;

  return (
    <div
      className="paper-box"
      style={{
        borderLeft: '5px solid var(--stamp-red)',
        backgroundColor: 'var(--stamp-red-tint)',
        borderColor: 'var(--stamp-red-border)',
        marginBottom: '28px',
        padding: '20px 24px',
        animation: 'inkIn 0.35s ease-out forwards',
      }}
      role="region"
      aria-label="Backdated entry ripple notice"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--stamp-red)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚡ STAMP NOTICE:</span>
            <span>BACKDATED ENTRY REWROTE HISTORY</span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-primary)', marginTop: '6px' }}>
            A transaction entered with effective date <strong>{formatLedgerDate(movement?.effective_date)}</strong> was inserted before existing entries.
            The costing engine re-simulated subsequent layers, dynamically re-pricing <strong>{changedCosts.length}</strong> downstream folio(s).
          </p>
        </div>

        <button
          className="ledger-btn ledger-btn-secondary"
          onClick={onDismiss}
          style={{ borderColor: 'var(--stamp-red)', color: 'var(--stamp-red)' }}
        >
          Dismiss & Clear Marks
        </button>
      </div>

      <div className="ruled-table-wrap" style={{ marginTop: '16px', backgroundColor: '#ffffff' }}>
        <table className="ruled-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Folio #</th>
              <th style={{ width: '110px' }}>Type</th>
              <th>Effective Date</th>
              <th className="text-right">Prior Unit Cost</th>
              <th className="text-right">New Unit Cost</th>
              <th className="text-right">Cost Variance (Δ)</th>
            </tr>
          </thead>
          <tbody>
            {changedCosts.map((c) => {
              const diff = Number(c.difference || 0);
              const isUp = diff > 0;

              return (
                <tr key={c.id}>
                  <td className="tabular-num">#{c.id}</td>
                  <td>
                    <StampBadge type={c.movement_type} />
                  </td>
                  <td className="tabular-num">{formatLedgerDate(c.effective_date)}</td>
                  <td className="text-right tabular-num" style={{ color: 'var(--ink-secondary)' }}>
                    {formatMoney(c.old_cost)}
                  </td>
                  <td className="text-right tabular-num" style={{ fontWeight: 600 }}>
                    {formatMoney(c.new_cost)}
                  </td>
                  <td
                    className="text-right tabular-num"
                    style={{
                      fontWeight: 700,
                      color: isUp ? 'var(--stamp-red)' : 'var(--accent-green-dark)',
                    }}
                  >
                    {isUp ? `+${formatMoney(diff)}` : formatMoney(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

