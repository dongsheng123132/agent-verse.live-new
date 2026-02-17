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
  image_url     TEXT,
  content_url   TEXT,
  markdown      TEXT,
  block_id      TEXT,
  block_w       INTEGER DEFAULT 1,
  block_h       INTEGER DEFAULT 1,
  block_origin_x INTEGER,
  block_origin_y INTEGER,
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

CREATE TABLE IF NOT EXISTS cell_api_keys (
  id         SERIAL PRIMARY KEY,
  key_hash   TEXT NOT NULL,
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cell_api_keys_xy_unique UNIQUE (x, y)
);

CREATE TABLE IF NOT EXISTS grid_events (
  id         SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  x          INTEGER,
  y          INTEGER,
  block_size TEXT,
  owner      TEXT,
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grid_cells_owner ON grid_cells (owner_address) WHERE owner_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grid_orders_status ON grid_orders (status);
CREATE INDEX IF NOT EXISTS idx_cell_api_keys_hash ON cell_api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_grid_events_created ON grid_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grid_cells_fts ON grid_cells USING GIN (to_tsvector('simple', COALESCE(markdown,'')));

-- Referral system
CREATE TABLE IF NOT EXISTS referrals (
  code       TEXT PRIMARY KEY,            -- e.g. 'ref_30_32'
  owner_x    INTEGER NOT NULL,
  owner_y    INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id              SERIAL PRIMARY KEY,
  referrer_code   TEXT NOT NULL REFERENCES referrals(code),
  buyer_receipt_id TEXT,
  buyer_x         INTEGER NOT NULL,
  buyer_y         INTEGER NOT NULL,
  purchase_amount NUMERIC(18,6) DEFAULT 0,
  reward_amount   NUMERIC(18,6) DEFAULT 0,   -- 10% of purchase
  status          TEXT DEFAULT 'pending',     -- pending / credited
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_code ON referral_rewards (referrer_code);

-- Migration for existing databases
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS content_url TEXT;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS markdown TEXT;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS block_id TEXT;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS block_w INTEGER DEFAULT 1;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS block_h INTEGER DEFAULT 1;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS block_origin_x INTEGER;
ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS block_origin_y INTEGER;
ALTER TABLE grid_orders ADD COLUMN IF NOT EXISTS ref_code TEXT;
