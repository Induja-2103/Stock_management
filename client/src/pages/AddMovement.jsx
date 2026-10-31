import React, { useState, useEffect } from 'react';

const MOVEMENT_TYPES = [
  { value: 'RECEIPT', label: 'RECEIPT (Incoming Stock / Purchase)' },
  { value: 'ISSUE_PRODUCTION', label: 'ISSUE_PRODUCTION (Raw Materials Issued to Production)' },
  { value: 'PRODUCTION_OUTPUT', label: 'PRODUCTION_OUTPUT (Finished Goods Produced)' },
  { value: 'SALE', label: 'SALE (Goods Sold to Customer)' },
  { value: 'SALES_RETURN', label: 'SALES_RETURN (Customer Returned Goods)' },
  { value: 'SCRAP', label: 'SCRAP (Damaged or Expired Stock Write-off)' },
];

export default function AddMovement() {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Form fields
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState('');
  const [movementType, setMovementType] = useState('RECEIPT');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [refSaleId, setRefSaleId] = useState('');
  const [note, setNote] = useState('');

  // Past sales for sale picker in SALES_RETURN
  const [pastSales, setPastSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Submission feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [changedCosts, setChangedCosts] = useState([]);

  // Fetch items list
  useEffect(() => {
    fetch('/api/items')
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        if (data.length > 0 && !itemId) {
          setItemId(data[0].id);
        }
      })
      .catch((err) => setError('Failed to load items: ' + err.message));
  }, []);

  // When itemId or movementType changes, load past sales if SALES_RETURN
  useEffect(() => {
    if (itemId && movementType === 'SALES_RETURN') {
      setLoadingSales(true);
      fetch(`/api/movements?item_id=${itemId}`)
        .then((res) => res.json())
        .then((data) => {
          const sales = (data.movements || []).filter((m) => m.movement_type === 'SALE');
          setPastSales(sales);
          if (sales.length > 0) {
            setRefSaleId(sales[0].id);
            if (sales[0].sale_price) {
              setSalePrice(sales[0].sale_price);
            }
          } else {
            setRefSaleId('');
          }
        })
        .catch((err) => console.error('Failed to load past sales', err))
        .finally(() => setLoadingSales(false));
    }
  }, [itemId, movementType]);

  // Is effective_date in the past?
  const isPastDate = effectiveDate && effectiveDate < todayStr;

  // Visibility logic
  const showUnitCost = movementType === 'RECEIPT' || movementType === 'PRODUCTION_OUTPUT';
  const showSalePrice = movementType === 'SALE' || movementType === 'SALES_RETURN';
  const showBatchExpiry = movementType === 'RECEIPT' || movementType === 'PRODUCTION_OUTPUT';
  const showSalePicker = movementType === 'SALES_RETURN';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setChangedCosts([]);

    if (!itemId) {
      setError('Please select an item.');
      return;
    }

    if (!qty || Number(qty) <= 0) {
      setError('Quantity must be a positive number greater than 0.');
      return;
    }

    if (showUnitCost && (unitCost === '' || Number(unitCost) < 0)) {
      setError('Unit cost is required and must be non-negative.');
      return;
    }

    if (showSalePicker && !refSaleId) {
      setError('Please select an original sale for this sales return.');
      return;
    }

    const payload = {
      item_id: Number(itemId),
      movement_type: movementType,
      qty: Number(qty),
      effective_date: effectiveDate,
      unit_cost: showUnitCost ? Number(unitCost) : null,
      sale_price: showSalePrice && salePrice !== '' ? Number(salePrice) : null,
      batch_no: showBatchExpiry && batchNo.trim() ? batchNo.trim() : null,
      expiry_date: showBatchExpiry && expiryDate ? expiryDate : null,
      ref_sale_id: showSalePicker && refSaleId ? Number(refSaleId) : null,
      note: note.trim() || null,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to record movement');
      }

      setSuccess(`Movement #${data.movement.id} (${movementType}) recorded successfully!`);

      if (data.changedCosts && data.changedCosts.length > 0) {
        setChangedCosts(data.changedCosts);
      }

      // Reset fields
      setQty('');
      setUnitCost('');
      setSalePrice('');
      setBatchNo('');
      setExpiryDate('');
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Add Stock Movement</h1>
          <p>Record inbound, production, sales, returns, or scrap transactions.</p>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="alert alert-danger">
          <div className="banner-title">⚠️ Movement Rejected</div>
          <div>{error}</div>
        </div>
      )}

      {/* Success alert */}
      {success && (
        <div className="alert alert-success">
          <div className="banner-title">✓ Success</div>
          <div>{success}</div>
        </div>
      )}

      {/* Changed Costs Banner */}
      {changedCosts.length > 0 && (
        <div className="alert alert-warning">
          <div className="banner-title">
            <span>⚡ Backdated Entry Impact: Re-costing Triggered</span>
          </div>
          <div>
            Because this movement was recorded with an effective date earlier than existing entries,
            the following <strong>{changedCosts.length}</strong> subsequent transaction(s) had their costs dynamically recalculated:
          </div>
          <table className="changed-costs-table">
            <thead>
              <tr>
                <th>Movement ID</th>
                <th>Type</th>
                <th>Effective Date</th>
                <th className="text-right">Old Unit Cost</th>
                <th className="text-right">New Unit Cost</th>
                <th className="text-right">Cost Difference</th>
              </tr>
            </thead>
            <tbody>
              {changedCosts.map((c) => (
                <tr key={c.id}>
                  <td>#{c.id}</td>
                  <td><strong>{c.movement_type}</strong></td>
                  <td>{c.effective_date}</td>
                  <td className="text-right">${Number(c.old_cost).toFixed(4)}</td>
                  <td className="text-right">${Number(c.new_cost).toFixed(4)}</td>
                  <td className="text-right" style={{ color: c.difference < 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                    {c.difference > 0 ? `+$${c.difference.toFixed(4)}` : `-$${Math.abs(c.difference).toFixed(4)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          {/* Item and Movement Type */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Item *</label>
              <select
                className="form-control"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} - {i.name} ({i.costing_method})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Movement Type *</label>
              <select
                className="form-control"
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                {MOVEMENT_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Effective Date & Quantity */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Effective Date *</label>
              <input
                type="date"
                className="form-control"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                className="form-control"
                placeholder="e.g. 10.00"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Past Date Yellow Warning */}
          {isPastDate && (
            <div className="alert alert-warning" style={{ margin: '8px 0 16px' }}>
              <div className="banner-title">⚠️ Backdated Transaction Notice</div>
              <div>
                The effective date (<strong>{effectiveDate}</strong>) is earlier than today (<strong>{todayStr}</strong>).
                Saving this movement will insert it in the past and automatically replay FIFO/WAC layers, which may modify the cost of subsequent sales or issues.
              </div>
            </div>
          )}

          {/* Dynamic Field: Unit Cost (RECEIPT, PRODUCTION_OUTPUT) */}
          {showUnitCost && (
            <div className="form-group">
              <label className="form-label">Unit Cost ($) *</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-control"
                placeholder="e.g. 24.5000"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
              <small style={{ color: 'var(--text-muted)' }}>
                Incoming unit cost stored on receipt; used to build FIFO layer or recalculate WAC.
              </small>
            </div>
          )}

          {/* Dynamic Field: Sale Price (SALE, SALES_RETURN) */}
          {showSalePrice && (
            <div className="form-group">
              <label className="form-label">Sale / Return Price ($)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-control"
                placeholder="e.g. 45.0000"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
              />
              <small style={{ color: 'var(--text-muted)' }}>
                Revenue selling price charged to customer.
              </small>
            </div>
          )}

          {/* Dynamic Field: Sale Picker (SALES_RETURN) */}
          {showSalePicker && (
            <div className="form-group">
              <label className="form-label">Original Sale Reference (ref_sale_id) *</label>
              {loadingSales ? (
                <p>Loading past sales for this item...</p>
              ) : pastSales.length === 0 ? (
                <div style={{ color: '#dc2626', fontSize: '13px' }}>
                  No prior SALE movements found for this item to return against.
                </div>
              ) : (
                <select
                  className="form-control"
                  value={refSaleId}
                  onChange={(e) => {
                    setRefSaleId(e.target.value);
                    const selected = pastSales.find((s) => String(s.id) === e.target.value);
                    if (selected && selected.sale_price) {
                      setSalePrice(selected.sale_price);
                    }
                  }}
                  required
                >
                  <option value="">-- Select an original sale --</option>
                  {pastSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sale #{s.id} on {s.effective_date} — Qty: {s.qty} @ ${Number(s.sale_price || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              )}
              <small style={{ color: 'var(--text-muted)' }}>
                The cost of this original sale will be restored to inventory.
              </small>
            </div>
          )}

          {/* Dynamic Field: Batch & Expiry (RECEIPT, PRODUCTION_OUTPUT) */}
          {showBatchExpiry && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Batch Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. BATCH-2026-A"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Expiry Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Note */}
          <div className="form-group">
            <label className="form-label">Note / Reference</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. PO #10842 or Work Order #33"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Recording Movement...' : 'Save Stock Movement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

