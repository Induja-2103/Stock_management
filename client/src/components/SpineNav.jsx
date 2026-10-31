import React from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { path: '/ledger', label: 'Ledger', roman: 'I.' },
  { path: '/entries/new', label: 'Add Entry', roman: 'II.' },
  { path: '/items', label: 'Items', roman: 'III.' },
  { path: '/statements', label: 'Statements', roman: 'IV.' },
];

export default function SpineNav() {
  return (
    <aside className="book-spine" aria-label="Ledger Book Navigation">
      <div className="spine-stitch" aria-hidden="true" />
      
      <div className="spine-header">
        <div className="spine-title">Stock Ledger</div>
        <div className="spine-subtitle">General Volume</div>
      </div>

      <nav className="spine-nav">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) => `spine-tab ${isActive ? 'active' : ''}`}
          >
            <span className="spine-tab-roman">{tab.roman}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="spine-footer">
        <div>FOLIO MMXXVI</div>
        <div style={{ marginTop: '4px', fontSize: '10px' }}>Append-Only Ledger</div>
      </div>
    </aside>
  );
}

