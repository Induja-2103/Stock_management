import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand">
        <span>📦</span>
        <span>Stock Valuation & Ledger</span>
      </NavLink>
      <nav>
        <ul className="navbar-nav">
          <li>
            <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Items
            </NavLink>
          </li>
          <li>
            <NavLink to="/movements/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Add Movement
            </NavLink>
          </li>
          <li>
            <NavLink to="/ledger" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Ledger
            </NavLink>
          </li>
          <li>
            <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Reports
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

