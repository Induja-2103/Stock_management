import React from 'react';
import { Outlet } from 'react-router-dom';
import SpineNav from './SpineNav';
import RippleBanner from './RippleBanner';
import { useLedger } from '../context/LedgerContext';

export default function BookLayout() {
  const { rippleData, dismissRipple } = useLedger();

  return (
    <div className="book-layout">
      <SpineNav />
      <main className="ledger-page" id="main-content" tabIndex="-1">
        {rippleData && (
          <RippleBanner
            rippleData={rippleData}
            onDismiss={dismissRipple}
          />
        )}
        <Outlet />
      </main>
    </div>
  );
}

