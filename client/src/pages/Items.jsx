import React, { useState, useEffect } from 'react';
import { api, formatMoney, formatQty } from '../api';
import LayerStack from '../components/LayerStack';
import { useLedger } from '../context/LedgerContext';

export default function Items() {
  const { items, refreshItems } = useLedger();

  // Selected item for layer inspection
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemMovements, setItemMovements] = useState([]);
  const [closingQty, setClosingQty] = useState(0);
  const [closingValue, setClosingValue] = useState(0);
  const [loadingLayers, setLoadingLayers] = useState(false);

  // Add Item form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('KG');
  const [costingMethod, setCostingMethod] = useState('FIFO');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  // Auto-select first item if none selected
  useEffect(() => {
    if (items.length > 0 && !selectedItem) {
      handleSelectItem(items[0]);
    }
  }, [items]);

  // Handle selecting an item to inspect its layers
  const handleSelectItem = async (itm) => {
    setSelectedItem(itm);
    setLoadingLayers(true);
    try {
      const data = await api.getMovements({ item_id: itm.id });
      setItemMovements(data.movements || []);
      setClosingQty(data.closingQty || 0);
      setClosingValue(data.closingValue || 0);
    } catch (err) {
      console.error('Failed to load item movements for layers:', err);
    } finally {
      setLoadingLayers(false);
    }
  };

  // Add Item submission
  const handleAddItem = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!code.trim() || !name.trim() || !unit.trim()) {
      setFormError('All item account fields are mandatory.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.createItem({
        code: code.trim(),
        name: name.trim(),
        unit: unit.trim(),
        costing_method: costingMethod,
      });

      setFormSuccess(`Item Account "${data.item.code}" inscribed successfully!`);
      setCode('');
      setName('');
      setUnit('KG');
      setCostingMethod('FIFO');
      await refreshItems();
      handleSelectItem(data.item);
    } catch (err) {
      setFormError(err.message || 'Failed to inscribe item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="title-double-rule">
        <h1 style={{ fontSize: '26px' }}>Catalog & Costing Methodologies</h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Define inventory accounts and inspect the real-time FIFO layer architecture or WAC moving average.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* FORM: Add Item */}
        <div className="paper-box">
          <div className="paper-box-title">
            <span>Inscribe New Item Account</span>
          </div>

          {formError && (
            <div className="ledger-ribbon-error" style={{ padding: '8px 12px', fontSize: '12px' }}>
              {formError}
            </div>
          )}

          {formSuccess && (
            <div className="ledger-ribbon-success" style={{ padding: '8px 12px', fontSize: '12px' }}>
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleAddItem}>
            <div style={{ marginBottom: '14px' }}>
              <label className="ledger-label">Item Code / Identifier *</label>
              <input
                type="text"
                className="ledger-input mono"
                placeholder="e.g. STEEL-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label className="ledger-label">Item Description / Name *</label>
              <input
                type="text"
                className="ledger-input"
                placeholder="e.g. Carbon Steel Plate 20mm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
              <div>
                <label className="ledger-label">Unit of Measure *</label>
                <input
                  type="text"
                  className="ledger-input"
                  placeholder="e.g. KG, PCS, LTR"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="ledger-label">Valuation Method *</label>
                <select
                  className="ledger-select"
                  value={costingMethod}
                  onChange={(e) => setCostingMethod(e.target.value)}
                >
                  <option value="FIFO">FIFO (Layers)</option>
                  <option value="WAC">WAC (Weighted Average)</option>
                </select>
              </div>
            </div>

            <button type="submit" className="ledger-btn ledger-btn-primary" disabled={submitting}>
              {submitting ? 'Inscribing...' : 'Add Item to Catalog'}
            </button>
          </form>
        </div>

        {/* LIST: Existing Items */}
        <div className="paper-box">
          <div className="paper-box-title">
            <span>Item Accounts ({items.length})</span>
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Click to inspect layers</span>
          </div>

          <div className="ruled-table-wrap" style={{ maxHeight: '310px', overflowY: 'auto' }}>
            <table className="ruled-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-muted)' }}>
                      No items defined yet.
                    </td>
                  </tr>
                ) : (
                  items.map((i) => {
                    const isSelected = selectedItem?.id === i.id;
                    return (
                      <tr
                        key={i.id}
                        onClick={() => handleSelectItem(i)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--accent-green-tint)' : undefined,
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        <td><strong>{i.code}</strong></td>
                        <td>{i.name}</td>
                        <td className="tabular-num">{i.unit}</td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '2px',
                              backgroundColor: i.costing_method === 'FIFO' ? 'rgba(31, 95, 74, 0.12)' : 'rgba(180, 83, 9, 0.12)',
                              color: i.costing_method === 'FIFO' ? 'var(--accent-green)' : 'var(--stamp-amber)',
                            }}
                          >
                            {i.costing_method}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SIGNATURE FEATURE: Cost Layer Stack */}
      {selectedItem && (
        <LayerStack
          item={selectedItem}
          movements={itemMovements}
          closingQty={closingQty}
          closingValue={closingValue}
        />
      )}
    </div>
  );
}
