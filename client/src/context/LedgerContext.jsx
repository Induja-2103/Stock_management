import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const LedgerContext = createContext();

export function LedgerProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemError, setItemError] = useState(null);

  // Ripple banner & highlighted row state
  const [rippleData, setRippleData] = useState(null); // { movement, changedCosts }
  const [highlightedMovementIds, setHighlightedMovementIds] = useState(new Set());

  // Reload items catalog
  const refreshItems = async () => {
    setLoadingItems(true);
    setItemError(null);
    try {
      const data = await api.getItems();
      setItems(data);
    } catch (err) {
      setItemError(err.message);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    refreshItems();
  }, []);

  // Trigger ripple banner and mark affected IDs
  const triggerRipple = (movement, changedCosts) => {
    setRippleData({ movement, changedCosts });
    const ids = new Set(changedCosts.map((c) => String(c.id)));
    setHighlightedMovementIds(ids);
  };

  const dismissRipple = () => {
    setRippleData(null);
    setHighlightedMovementIds(new Set());
  };

  return (
    <LedgerContext.Provider
      value={{
        items,
        loadingItems,
        itemError,
        refreshItems,
        rippleData,
        highlightedMovementIds,
        triggerRipple,
        dismissRipple,
      }}
    >
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider');
  }
  return context;
}

