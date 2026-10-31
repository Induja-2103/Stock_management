import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, formatQty, round4 } from '../api';
import StampBadge from '../components/StampBadge';
import { useLedger } from '../context/LedgerContext';

const MOVEMENT_TYPES = [
  { value: 'RECEIPT', label: 'RECEIPT — Inbound Goods / Purchase' },
  { value: 'ISSUE_PRODUCTION', label: 'ISSUE — Raw Materials to Production' },
  { value: 'PRODUCTION_OUTPUT', label: 'OUTPUT — Finished Goods from Workshop' },
  { value: 'SALE', label: 'SALE — Outbound Shipment to Customer' },
  { value: 'SALES_RETURN', label: 'RETURN — Restocked from Prior Customer Sale' },
  { value: 'SCRAP', label: 'SCRAP — Damaged or Expired Inventory Discard' },
];

export default function AddEntry() {
  const { items, loadingItems, itemError, refreshItems, triggerRipple } = useLedger();
  const todayStr = new Date().toISOString().slice(0, 10);
  const fileInputRef = useRef(null);

  // Form Fields: Choose movement type FIRST
  const [movementType, setMovementType] = useState('RECEIPT');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [unitCost, setUnitCost] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [refSaleId, setRefSaleId] = useState('');

  // Receipt Upload State
  const [receiptData, setReceiptData] = useState('');
  const [receiptName, setReceiptName] = useState('');
  const [receiptSize, setReceiptSize] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Item current balance for live preview
  const [currentBalance, setCurrentBalance] = useState({ qty: 0, value: 0 });
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Sales picker for returns
  const [pastSales, setPastSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Status feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Auto-select first item when items load
  useEffect(() => {
    if (items.length > 0 && !itemId) {
      setItemId(String(items[0].id));
    }
  }, [items, itemId]);

  // Fetch current item valuation & stock balance for live preview
  useEffect(() => {
    if (!itemId) {
      setCurrentBalance({ qty: 0, value: 0 });
      return;
    }

    setLoadingBalance(true);
    api.getMovements({ item_id: itemId })
      .then((data) => {
        setCurrentBalance({
          qty: data.closingQty || 0,
          value: data.closingValue || 0,
        });

        // If SALES_RETURN, load past sales
        if (movementType === 'SALES_RETURN') {
          const sales = (data.movements || []).filter((m) => m.movement_type === 'SALE');
          setPastSales(sales);
          if (sales.length > 0) {
            setRefSaleId(String(sales[0].id));
            if (sales[0].sale_price) {
              setSalePrice(String(sales[0].sale_price));
            }
          } else {
            setRefSaleId('');
          }
        }
      })
      .catch((err) => console.error('Error fetching balance:', err))
      .finally(() => setLoadingBalance(false));
  }, [itemId, movementType]);

  const selectedItem = items.find((i) => String(i.id) === String(itemId));

  // Field visibility rules
  const showUnitCost = movementType === 'RECEIPT' || movementType === 'PRODUCTION_OUTPUT';
  const showSalePrice = movementType === 'SALE' || movementType === 'SALES_RETURN';
  const showBatchExpiry = movementType === 'RECEIPT';
  const showSalePicker = movementType === 'SALES_RETURN';
  const isBackdated = effectiveDate && effectiveDate < todayStr;

  // Receipt File Processing
  const handleReceiptFile = (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('Receipt file size is too large (maximum 15MB).');
      return;
    }

    const sizeFormatted = file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptData(reader.result);
      setReceiptName(file.name);
      setReceiptSize(sizeFormatted);
    };
    reader.readAsDataURL(file);
  };

  const removeReceipt = () => {
    setReceiptData('');
    setReceiptName('');
    setReceiptSize('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Live Preview Calculation
  const parsedQty = parseFloat(qty) || 0;
  const isIncoming = movementType === 'RECEIPT' || movementType === 'PRODUCTION_OUTPUT' || movementType === 'SALES_RETURN';
  
  let projectedQty = currentBalance.qty;
  let projectedValue = currentBalance.value;

  if (isIncoming) {
    projectedQty = round4(currentBalance.qty + parsedQty);
    if (showUnitCost) {
      const parsedCost = parseFloat(unitCost) || 0;
      projectedValue = round4(currentBalance.value + (parsedQty * parsedCost));
    } else if (showSalePicker) {
      const selectedSale = pastSales.find((s) => String(s.id) === String(refSaleId));
      const saleCost = selectedSale?.unit_cost || 0;
      projectedValue = round4(currentBalance.value + (parsedQty * saleCost));
    }
  } else {
    projectedQty = round4(currentBalance.qty - parsedQty);
    const avgCost = currentBalance.qty > 0 ? (currentBalance.value / currentBalance.qty) : 0;
    projectedValue = round4(currentBalance.value - (parsedQty * avgCost));
  }

  // Handle Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!itemId) {
      setError('Please select an item account.');
      return;
    }

    if (!qty || Number(qty) <= 0) {
      setError('Quantity must be a positive number greater than 0.');
      return;
    }

    if (showUnitCost && (unitCost === '' || Number(unitCost) < 0)) {
      setError('Unit cost is required for receipts and production output.');
      return;
    }

    if (showSalePicker && !refSaleId) {
      setError('Please select a prior sale folio to return against.');
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
      receipt_data: receiptData || null,
      note: receiptName ? `Receipt: ${receiptName}` : null,
    };

    setSubmitting(true);
    try {
      const data = await api.createMovement(payload);
      setSuccess(`Folio #${data.movement.id} (${movementType}) recorded successfully into the ledger!`);

      // Trigger ripple banner if backdated entry modified existing costs
      if (data.changedCosts && data.changedCosts.length > 0) {
        triggerRipple(data.movement, data.changedCosts);
      }

      // Reset fields
      setQty('');
      setUnitCost('');
      setSalePrice('');
      setBatchNo('');
      setExpiryDate('');
      removeReceipt();

      // Refresh item current balance
      const balRes = await api.getMovements({ item_id: itemId });
      setCurrentBalance({
        qty: balRes.closingQty || 0,
        value: balRes.closingValue || 0,
      });
    } catch (err) {
      setError(err.message || 'The ledger rejected this transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px' }}>
      <div className="title-double-rule">
        <h1 style={{ fontSize: '26px' }}>Inscribe New Ledger Entry</h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Select the transaction nature, choose the item account, attach receipts, and verify live projected balance.
        </p>
      </div>

      {itemError && (
        <div className="ledger-ribbon-error" role="alert">
          <strong>Database Connection Notice:</strong> {itemError}
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="ledger-btn ledger-btn-secondary"
              onClick={refreshItems}
              disabled={loadingItems}
            >
              {loadingItems ? 'Reconnecting...' : 'Retry Connecting to Ledger'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="ledger-ribbon-error" role="alert">
          <strong>Entry Rejected:</strong> {error}
        </div>
      )}

      {success && (
        <div className="ledger-ribbon-success" role="status">
          <strong>Recorded:</strong> {success}
        </div>
      )}

      {/* Amber warning for past effective date */}
      {isBackdated && (
        <div className="ledger-ribbon-warn" role="alert">
          <strong>⚠️ Historical Entry Warning:</strong> The chosen effective date ({effectiveDate}) precedes today's calendar date ({todayStr}).
          Entering a historical movement will replay inventory layers and may dynamically adjust costs of subsequent sales.
        </div>
      )}

      {items.length === 0 && !loadingItems && !itemError && (
        <div className="ledger-ribbon-warn" style={{ marginBottom: '20px' }}>
          <strong>No Item Accounts Found:</strong> The ledger contains no items yet.
          Please visit <Link to="/items" style={{ fontWeight: 600, color: 'var(--accent-green-dark)' }}>Items Account Catalog</Link> to create your first item (e.g. STEEL, PAINT).
        </div>
      )}

      <div className="paper-box">
        <form onSubmit={handleSubmit}>
          {/* STEP 1: Movement Type Picker First */}
          <div style={{ marginBottom: '20px' }}>
            <label className="ledger-label">1. Movement Nature (Choose First) *</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {MOVEMENT_TYPES.map((m) => {
                const isSelected = movementType === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMovementType(m.value)}
                    style={{
                      background: isSelected ? 'var(--paper-card-highlight)' : 'transparent',
                      border: isSelected ? '2px solid var(--accent-green)' : '1px dashed var(--paper-rule-strong)',
                      borderRadius: '3px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <StampBadge type={m.value} />
                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, color: 'var(--ink-primary)' }}>
                      {m.value}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Item & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="ledger-label">
                Item Account * {loadingItems && <span style={{ textTransform: 'none', color: 'var(--ink-muted)' }}>(Loading...)</span>}
              </label>
              <select
                className="ledger-select"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
                disabled={loadingItems || items.length === 0}
              >
                {items.length === 0 ? (
                  <option value="">{loadingItems ? '-- Loading Items --' : '-- No Items Available --'}</option>
                ) : (
                  items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} — {i.name} [{i.costing_method}]
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="ledger-label">Effective Date *</label>
              <input
                type="date"
                className="ledger-input mono"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* STEP 3: Quantity */}
          <div style={{ marginBottom: '16px' }}>
            <label className="ledger-label">
              Quantity {selectedItem ? `(${selectedItem.unit})` : ''} *
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              className="ledger-input mono"
              placeholder="e.g. 10.00"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>

          {/* Dynamic Field: Unit Cost (RECEIPT, PRODUCTION_OUTPUT) */}
          {showUnitCost && (
            <div style={{ marginBottom: '16px' }}>
              <label className="ledger-label">Acquisition / Production Unit Cost ($) *</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="ledger-input mono"
                placeholder="e.g. 45.0000"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                Recorded cost per {selectedItem?.unit || 'unit'}; forms new layer in FIFO or adjusts WAC pool.
              </span>
            </div>
          )}

          {/* Dynamic Field: Sale Price (SALE, SALES_RETURN) */}
          {showSalePrice && (
            <div style={{ marginBottom: '16px' }}>
              <label className="ledger-label">Selling Price to Customer ($)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="ledger-input mono"
                placeholder="e.g. 75.0000"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                Customer invoice price used for sales revenue and gross margin calculation.
              </span>
            </div>
          )}

          {/* Dynamic Field: Sale Picker (SALES_RETURN) */}
          {showSalePicker && (
            <div style={{ marginBottom: '16px' }}>
              <label className="ledger-label">Original Sale Folio Reference *</label>
              {loadingSales ? (
                <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Locating prior sales...</p>
              ) : pastSales.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--stamp-red)' }}>
                  No prior SALE transactions found for this item to return against.
                </div>
              ) : (
                <select
                  className="ledger-select mono"
                  value={refSaleId}
                  onChange={(e) => {
                    setRefSaleId(e.target.value);
                    const sel = pastSales.find((s) => String(s.id) === e.target.value);
                    if (sel && sel.sale_price) setSalePrice(String(sel.sale_price));
                  }}
                  required
                >
                  <option value="">-- Choose past sale --</option>
                  {pastSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      Folio #{s.id} on {s.effective_date}: {s.qty} {selectedItem?.unit} @ {formatMoney(s.sale_price)}
                    </option>
                  ))}
                </select>
              )}
              <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                Restores stock at the exact cost assigned when that sale was dispatched.
              </span>
            </div>
          )}

          {/* Dynamic Field: Batch & Expiry (RECEIPT) */}
          {showBatchExpiry && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label className="ledger-label">Batch / Lot Number</label>
                <input
                  type="text"
                  className="ledger-input mono"
                  placeholder="e.g. LOT-2026-08A"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                />
              </div>

              <div>
                <label className="ledger-label">Batch Expiration Date</label>
                <input
                  type="date"
                  className="ledger-input mono"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* RECEIPT UPLOAD (Replaces extra reference/memorandum text clutter) */}
          <div style={{ marginBottom: '22px' }}>
            <label className="ledger-label">Attach Receipt / Invoice Voucher</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => handleReceiptFile(e.target.files[0])}
            />

            {!receiptData ? (
              <div
                className={`receipt-upload-zone ${isDragOver ? 'dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleReceiptFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>🧾</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>
                  Click to Browse or Drag & Drop Receipt
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                  Upload supplier invoice, purchase voucher, or proof of receipt (PNG, JPG, PDF up to 15MB)
                </div>
              </div>
            ) : (
              <div className="receipt-preview-card">
                {receiptData.startsWith('data:image/') ? (
                  <img src={receiptData} alt="Receipt preview" className="receipt-thumb" />
                ) : (
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--paper-card)',
                      border: '1px solid var(--paper-rule-strong)',
                      fontSize: '24px',
                      borderRadius: '2px',
                    }}
                  >
                    📄
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {receiptName}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--accent-green-dark)', fontFamily: 'var(--font-mono)' }}>
                    ✓ Attached ({receiptSize})
                  </div>
                </div>
                <button
                  type="button"
                  className="ledger-btn ledger-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--stamp-red)' }}
                  onClick={removeReceipt}
                >
                  ✕ Remove
                </button>
              </div>
            )}
          </div>

          {/* SIGNATURE FEATURE: Live Preview Line */}
          {selectedItem && (
            <div
              style={{
                backgroundColor: 'rgba(31, 95, 74, 0.06)',
                border: '1px solid rgba(31, 95, 74, 0.25)',
                borderLeft: '4px solid var(--accent-green)',
                padding: '14px 18px',
                marginBottom: '24px',
                borderRadius: '2px',
                fontFamily: 'var(--font-serif)',
                fontSize: '15px',
                color: 'var(--ink-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📜</span>
                <span>
                  After this entry:{' '}
                  <strong style={{ color: 'var(--accent-green-dark)' }}>{selectedItem.code}</strong> balance{' '}
                  <strong className="tabular-num" style={{ fontFamily: 'var(--font-mono)' }}>
                    {formatQty(projectedQty)} {selectedItem.unit}
                  </strong>
                  , value{' '}
                  <strong className="tabular-num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green-dark)' }}>
                    {formatMoney(projectedValue)}
                  </strong>
                </span>
              </div>
              {projectedQty < 0 && (
                <div style={{ color: 'var(--stamp-red)', fontSize: '13px', marginTop: '6px', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  ⚠️ Warning: This entry would cause negative inventory ({formatQty(projectedQty)} {selectedItem.unit}). The ledger will reject it.
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="ledger-btn ledger-btn-primary"
            disabled={submitting || projectedQty < 0 || items.length === 0}
            style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          >
            {submitting ? 'Inscribing in Ledger...' : 'Affix Entry to Stock Ledger'}
          </button>
        </form>
      </div>
    </div>
  );
}
