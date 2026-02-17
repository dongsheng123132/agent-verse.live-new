-- 最小 schema：100x100 格子售卖
CREATE TABLE IF NOT EXISTS grid_cells (
  id            BIGINT PRIMARY KEY,
  x             INTEGER NOT NULL,
  y             INTEGER NOT NULL,
  owner_address TEXT,
  status        TEXT DEFAULT 'EMPTY',
  is_for_sale   BOOLEAN DEFAULT FALSE,
  price_usdc    NUMERIC(18, 6),
  fill_color    TEXT,
  title         TEXT,
  summary       TEXT,
  last_updated  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT grid_cells_xy_unique UNIQUE (x, y)
);

CREATE TABLE IF NOT EXISTS grid_orders (
  receipt_id         TEXT PRIMARY KEY,
  x                  INTEGER,
  y                  INTEGER,
  amount_usdc        NUMERIC(18, 6),
  unique_amount      NUMERIC(18, 6),
  pay_method         TEXT,
  status             TEXT DEFAULT 'pending',
  treasury_address   TEXT,
  commerce_charge_id TEXT,
  tx_hash            TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grid_cells_owner ON grid_cells (owner_address) WHERE owner_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grid_orders_status ON grid_orders (status);
