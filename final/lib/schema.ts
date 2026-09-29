import { dbQuery } from './db.js'

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
const SCHEMA_STATEMENTS: string[] = [
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
