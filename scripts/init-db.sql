-- AgentGrid MVP - Database Schema
-- Run this against your Neon PostgreSQL instance

-- 1. grid_cells: grid ownership & display
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
  image_url     TEXT,
  content_url   TEXT,
  markdown      TEXT,
  last_updated  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT grid_cells_xy_unique UNIQUE (x, y)
);

-- 2. grid_orders: payment flow
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

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_grid_cells_owner ON grid_cells (owner_address) WHERE owner_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grid_orders_status ON grid_orders (status);

-- 4. Seed demo data (3 reserved cells from whitepaper)
INSERT INTO grid_cells (id, x, y, owner_address, status, fill_color, title, summary, content_url, markdown, last_updated)
VALUES
  (2424, 24, 24,
   '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6',
   'HOLDING', '#6366f1', 'CORE_NODE_A', 'Core Zone A - x402 Demo',
   'https://docs.cdp.coinbase.com/x402/welcome',
   '## CORE_NODE_A\n\nCore node at (24,24), x402 payment entry point.', NOW()),

  (2425, 25, 24,
   '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6',
   'HOLDING', '#ec4899', 'CORE_NODE_B', 'Core Zone B - AgentKit',
   'https://docs.cdp.coinbase.com/agent-kit/welcome',
   '## CORE_NODE_B\n\nAgentKit integration node at (25,24).', NOW()),

  (5050, 50, 50,
   '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6',
   'HOLDING', '#f59e0b', 'BASE_HUB', 'World Center Hub',
   'https://base.org',
   '## BASE_HUB\n\nWorld center (50,50), system reserved.', NOW())

ON CONFLICT (x, y) DO UPDATE SET
  owner_address = EXCLUDED.owner_address,
  status        = EXCLUDED.status,
  fill_color    = EXCLUDED.fill_color,
  title         = EXCLUDED.title,
  summary       = EXCLUDED.summary,
  content_url   = EXCLUDED.content_url,
  markdown      = EXCLUDED.markdown,
  last_updated  = EXCLUDED.last_updated;
