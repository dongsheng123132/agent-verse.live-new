import { dbQuery } from './db.ts'

// Purely additive, idempotent statements that bring an existing database up
// to date with the schema purchase / regen-key / bulk-purchase now depend on
// (grid_orders.network, grid_orders.payer_address, cell_reservations + its
// expires_at index). Mirrors scripts/init-db.sql lines 121-140 exactly — that
// file is still the source of truth for fresh databases; this module only
// exists to bring an *already-deployed* database (which init-db.sql is never
// re-run against automatically) up to the same shape at request time.
//
// Every statement here MUST be safe to run against a database that already
// has these objects (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
// CREATE INDEX IF NOT EXISTS) and MUST NOT touch existing rows — no DROP, no
// ALTER COLUMN TYPE, no UPDATE/DELETE.
// Exported (read-only use) so scripts/local-db.mjs can apply the very same
// statements to the local PGlite database instead of keeping a second copy.
export const SCHEMA_STATEMENTS: string[] = [
  `ALTER TABLE grid_orders ADD COLUMN IF NOT EXISTS network TEXT`,
  `ALTER TABLE grid_orders ADD COLUMN IF NOT EXISTS payer_address TEXT`,
  `CREATE TABLE IF NOT EXISTS cell_reservations (
     x          INTEGER NOT NULL,
     y          INTEGER NOT NULL,
     nonce      TEXT,
     payer      TEXT,
     network    TEXT,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     CONSTRAINT cell_reservations_xy_unique UNIQUE (x, y)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cell_reservations_expires ON cell_reservations (expires_at)`,
  // --- P2/P3 x402 service market (MONAD-MARKET-SPEC.md). Mirrors
  // scripts/init-db.sql's "x402 service market" / "Text-market cache" blocks
  // exactly — see that file for the long-form comments. ---
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS service_url TEXT`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS service_method TEXT`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS service_desc TEXT`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS service_category TEXT`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS probe_status TEXT DEFAULT 'unprobed'`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS probe_accepts JSONB`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS probed_at TIMESTAMPTZ`,
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS evidence JSONB`,
  // 链上证据已于 2026-10-03 下线：`evidence` / `evidence_by_network` 两列保留（不改表），
  // 但不再写入也不再读取。
  `ALTER TABLE grid_cells ADD COLUMN IF NOT EXISTS evidence_by_network JSONB`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'grid_cells_probe_status_check'
     ) THEN
       ALTER TABLE grid_cells ADD CONSTRAINT grid_cells_probe_status_check
         CHECK (probe_status IN ('verified', 'candidate', 'failed', 'unprobed'));
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS idx_grid_cells_service_url ON grid_cells (service_url) WHERE service_url IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_grid_cells_probe_status ON grid_cells (probe_status) WHERE service_url IS NOT NULL`,
  // market_services: no longer read or written since 2026-10-04 (the index is grid_cells.service_url only); table kept, never dropped.
  `CREATE TABLE IF NOT EXISTS market_services (
     url          TEXT PRIMARY KEY,
     name         TEXT,
     method       TEXT,
     description  TEXT,
     category     TEXT,
     origin       TEXT,
     network      TEXT,
     price_usdc   TEXT,
     pay_to       TEXT,
     status       TEXT DEFAULT 'unprobed',
     probe_accepts JSONB,
     evidence     JSONB,
     note         TEXT,
     probed_at    TIMESTAMPTZ,
     updated_at   TIMESTAMPTZ DEFAULT NOW()
   )`,
  // 2026-09-30 诚实标注修复：同上，market_services 这张表也需要按网络拆分的证据。
  `ALTER TABLE market_services ADD COLUMN IF NOT EXISTS evidence_by_network JSONB`,
  `CREATE INDEX IF NOT EXISTS idx_market_services_status ON market_services (status)`,
  `CREATE INDEX IF NOT EXISTS idx_market_services_probed_at ON market_services (probed_at)`,
]

let ensureSchemaPromise: Promise<void> | null = null

async function runEnsureSchema(): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await dbQuery(statement)
  }
}

/**
 * Ensures grid_orders.network / grid_orders.payer_address / cell_reservations
 * (and its expires_at index) exist. Safe to call on every request: the first
 * call's promise is cached so the statements run at most once per process;
 * later calls just await the same (already-resolved) promise. If the first
 * attempt fails, the cache is cleared so the next call retries from scratch
 * instead of permanently wedging the process into a failed state.
 */
export function ensureSchema(): Promise<void> {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = runEnsureSchema().catch((err) => {
      ensureSchemaPromise = null
      throw err
    })
  }
  return ensureSchemaPromise
}

/** Test-only: clears the cached promise so a fresh ensureSchema() run can be observed against a new test database. */
export function resetSchemaCache(): void {
  ensureSchemaPromise = null
}
