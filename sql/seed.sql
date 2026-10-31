-- Sample Ledger Seed Data
-- Demonstrates FIFO / WAC costing, retroactive backdated entry, batch expiry, and financial reconciliation

-- Clean existing data
TRUNCATE TABLE stock_ledger, items RESTART IDENTITY CASCADE;

-- 1. Insert Item Masters
INSERT INTO items (id, code, name, unit, costing_method) VALUES
(1, 'STEEL', 'Carbon Steel Sheet 10mm', 'KG', 'FIFO'),
(2, 'PAINT', 'Industrial Epoxy Paint', 'L', 'WAC'),
(3, 'ADHESIVE', 'Industrial Contact Adhesive', 'CAN', 'FIFO'),
(4, 'CHAIR', 'Ergonomic Office Chair', 'PCS', 'WAC'),
(5, 'TABLE', 'Solid Oak Executive Desk', 'PCS', 'FIFO');

-- 2. Insert Stock Ledger Movements
-- STEEL: FIFO with late receipt
INSERT INTO stock_ledger (id, item_id, movement_type, qty, direction, unit_cost, sale_price, effective_date, entered_date, batch_no, expiry_date, ref_sale_id, note) VALUES
(1, 1, 'RECEIPT', 90, 'IN', 60.0000, NULL, '2026-10-01', '2026-10-01 09:00:00', 'ST-01', NULL, NULL, 'Initial steel shipment'),
(2, 1, 'RECEIPT', 10, 'IN', 64.0000, NULL, '2026-10-05', '2026-10-12 14:30:00', 'ST-02', NULL, NULL, 'Late-entered steel receipt (effective 05-Oct, entered 12-Oct)'),
(3, 1, 'RECEIPT', 50, 'IN', 70.0000, NULL, '2026-10-08', '2026-10-08 10:00:00', 'ST-03', NULL, NULL, 'Additional steel supply'),
(4, 1, 'ISSUE_PRODUCTION', 100, 'OUT', NULL, NULL, '2026-10-10', '2026-10-10 11:00:00', NULL, NULL, NULL, 'Issued to fabrication workshop');

-- PAINT: WAC (Weighted Average Cost)
INSERT INTO stock_ledger (id, item_id, movement_type, qty, direction, unit_cost, sale_price, effective_date, entered_date, batch_no, expiry_date, ref_sale_id, note) VALUES
(5, 2, 'RECEIPT', 100, 'IN', 10.0000, NULL, '2026-10-01', '2026-10-01 09:30:00', 'PT-01', NULL, NULL, 'Paint batch 1'),
(6, 2, 'RECEIPT', 100, 'IN', 13.5000, NULL, '2026-10-05', '2026-10-05 10:00:00', 'PT-02', NULL, NULL, 'Paint batch 2'),
(7, 2, 'ISSUE_PRODUCTION', 100, 'OUT', NULL, NULL, '2026-10-15', '2026-10-15 14:00:00', NULL, NULL, NULL, 'Issued to finishing line');

-- ADHESIVE: FIFO with batch expiration
INSERT INTO stock_ledger (id, item_id, movement_type, qty, direction, unit_cost, sale_price, effective_date, entered_date, batch_no, expiry_date, ref_sale_id, note) VALUES
(8, 3, 'RECEIPT', 20, 'IN', 20.0000, NULL, '2026-10-01', '2026-10-01 10:15:00', 'ADH-01', '2026-10-15', NULL, 'Perishable adhesive batch'),
(9, 3, 'RECEIPT', 49, 'IN', 20.0000, NULL, '2026-10-05', '2026-10-05 11:30:00', 'ADH-02', '2026-12-31', NULL, 'Standard shelf-life adhesive batch'),
(10, 3, 'SCRAP', 20, 'OUT', NULL, NULL, '2026-10-20', '2026-10-20 16:00:00', 'ADH-01', '2026-10-15', NULL, 'Expired batch write-off for ADH-01');

-- CHAIR: WAC with sales return referencing prior sale
INSERT INTO stock_ledger (id, item_id, movement_type, qty, direction, unit_cost, sale_price, effective_date, entered_date, batch_no, expiry_date, ref_sale_id, note) VALUES
(11, 4, 'PRODUCTION_OUTPUT', 100, 'IN', 120.0000, NULL, '2026-10-01', '2026-10-01 16:00:00', NULL, NULL, NULL, 'Completed assembly run 1'),
(12, 4, 'PRODUCTION_OUTPUT', 121, 'IN', 124.9813, NULL, '2026-10-05', '2026-10-05 17:00:00', NULL, NULL, NULL, 'Completed assembly run 2'),
(13, 4, 'SALE', 90, 'OUT', NULL, 185.0000, '2026-10-10', '2026-10-10 12:00:00', NULL, NULL, NULL, 'Sales dispatch to client Acme Corp'),
(14, 4, 'SALES_RETURN', 10, 'IN', NULL, 185.0000, '2026-10-15', '2026-10-15 15:00:00', NULL, NULL, 13, 'Client return: surplus unneeded units');

-- TABLE: Executive Desk Sale for total period COGS
INSERT INTO stock_ledger (id, item_id, movement_type, qty, direction, unit_cost, sale_price, effective_date, entered_date, batch_no, expiry_date, ref_sale_id, note) VALUES
(15, 5, 'PRODUCTION_OUTPUT', 20, 'IN', 480.0000, NULL, '2026-10-01', '2026-10-01 14:00:00', NULL, NULL, NULL, 'Finished bespoke desks'),
(16, 5, 'SALE', 20, 'OUT', NULL, 750.0000, '2026-10-12', '2026-10-12 11:30:00', NULL, NULL, NULL, 'Corporate office fulfillment');

-- Reset sequences to max ID
SELECT setval('items_id_seq', (SELECT MAX(id) FROM items));
SELECT setval('stock_ledger_id_seq', (SELECT MAX(id) FROM stock_ledger));
