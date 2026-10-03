import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PGlite } from '@electric-sql/pglite'
import type { Transaction } from '@electric-sql/pglite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SCHEMA_SQL = readFileSync(path.join(__dirname, '..', '..', 'scripts', 'init-db.sql'), 'utf8')

export interface PgliteClientLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>
}

/**
 * A fully in-memory Postgres (no network, no Neon) that exposes the same
 * shape as lib/db.js: `dbQuery(text, params)` and `withTransaction(fn)`.
 * Used to replace lib/db.js wholesale via `vi.mock` in tests so every module
 * that imports it (routes, api-key.js) transparently
 * runs against this instance without any production code changes.
 *
 * `schemaSql` defaults to the full current scripts/init-db.sql; pass an
 * alternate schema (e.g. an older snapshot missing recently-added
 * columns/tables) to test migration/backfill logic like lib/schema.ts's
 * ensureSchema() against a database that doesn't have those objects yet.
 */
export async function createTestDb(schemaSql: string = SCHEMA_SQL) {
  const pglite = new PGlite()
  await pglite.exec(schemaSql)

  async function dbQuery(text: string, params?: unknown[]) {
    const res = await pglite.query<Record<string, any>>(text, params)
    return { rows: res.rows as any[], rowCount: res.rows.length }
  }

  async function withTransaction<T>(fn: (client: PgliteClientLike) => Promise<T>): Promise<T> {
    return pglite.transaction(async (tx: Transaction) => {
      const client: PgliteClientLike = {
        query: async (text, params) => {
          const res = await tx.query(text, params)
          return { rows: res.rows as any[], rowCount: (res.rows as any[]).length }
        },
      }
      return fn(client)
    })
  }

  async function reset() {
    await pglite.exec(`
      TRUNCATE TABLE cell_reservations, cell_api_keys,
        grid_orders, grid_cells RESTART IDENTITY CASCADE;
    `)
  }

  async function close() {
    await pglite.close()
  }

  return { pglite, dbQuery, withTransaction, reset, close }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
