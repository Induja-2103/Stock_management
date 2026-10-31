-- Stock Management & Inventory Valuation Schema
-- Rules: Append-only stock ledger, NUMERIC(18,4) monetary precision

-- Items Master Table
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    costing_method VARCHAR(10) NOT NULL CHECK (costing_method IN ('FIFO', 'WAC')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Append-Only Stock Ledger
CREATE TABLE IF NOT EXISTS stock_ledger (
    id BIGSERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (
        movement_type IN (
            'RECEIPT',
            'ISSUE_PRODUCTION',
            'PRODUCTION_OUTPUT',
            'SALE',
            'SALES_RETURN',
            'SCRAP'
        )
    ),
    qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    unit_cost NUMERIC(18, 4) NULL CHECK (unit_cost IS NULL OR unit_cost >= 0),
    sale_price NUMERIC(18, 4) NULL CHECK (sale_price IS NULL OR sale_price >= 0),
    effective_date DATE NOT NULL,
    entered_date TIMESTAMP NOT NULL DEFAULT NOW(),
    batch_no VARCHAR(100) NULL,
    expiry_date DATE NULL,
    ref_sale_id BIGINT NULL,
    note TEXT NULL,
    receipt_data TEXT NULL
);

-- Trigger function to strictly enforce append-only behavior on stock_ledger
CREATE OR REPLACE FUNCTION prevent_stock_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'stock_ledger is append-only: UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

-- Trigger to block updates and deletes
DROP TRIGGER IF EXISTS trg_prevent_stock_ledger_mutation ON stock_ledger;
CREATE TRIGGER trg_prevent_stock_ledger_mutation
BEFORE UPDATE OR DELETE ON stock_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_stock_ledger_mutation();

-- Index on (item_id, effective_date, id) for optimized chronological ledger replay
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_effective_id
ON stock_ledger (item_id, effective_date, id);

