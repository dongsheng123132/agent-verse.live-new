import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, SCHEMA_SQL, type TestDb } from './helpers/pglite-db'

// Snapshot of the schema exactly as it existed BEFORE the P2/P3 "x402 service
// market" migration block (service_url/probe_*/evidence columns on
// grid_cells + the market_services table) was added — i.e. everything the
// P0/P1 dual-chain-settlement migration already covers, but nothing new.
// This is what a production database looks like right now (2026-09-29),
// before this deploy's ensureSchema() has ever run against it.
const MIGRATION_MARKER = '-- x402 service market'
const markerIndex = SCHEMA_SQL.indexOf(MIGRATION_MARKER)
if (markerIndex === -1) {
  throw new Error(`scripts/init-db.sql no longer contains the expected "${MIGRATION_MARKER}" marker comment; update this test to match`)
}
const OLD_SCHEMA_SQL = SCHEMA_SQL.slice(0, markerIndex)

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb(OLD_SCHEMA_SQL)
  dbHolder.db = testDb
  process.env.DATABASE_URL = 'postgres://test-fake-not-used'
  // Pre-existing data on the old schema — must survive the migration untouched.
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, title, block_id, block_origin_x, block_origin_y) VALUES (9191, 91, 91, '0xPreMarket', 'Old Cell', 'blk', 91, 91)`
  )
})
afterAll(async () => {
  await testDb.close()
})

const { ensureSchema, resetSchemaCache } = await import('../lib/schema')

describe('lib/schema.ts ensureSchema() adding the x402 service market (P2/P3) columns/table', () => {
  it('sanity check: the seeded old schema really is missing the new objects', async () => {
    await expect(testDb.dbQuery(`SELECT service_url FROM grid_cells LIMIT 1`)).rejects.toBeTruthy()
    await expect(testDb.dbQuery(`SELECT 1 FROM market_services LIMIT 1`)).rejects.toBeTruthy()
  })

  it('runs twice without error, is idempotent, and does not mutate pre-existing grid_cells rows', async () => {
    resetSchemaCache()
    const before = await testDb.dbQuery('SELECT * FROM grid_cells WHERE x=91 AND y=91')

    await expect(ensureSchema()).resolves.toBeUndefined()
    await expect(ensureSchema()).resolves.toBeUndefined()

    const after = await testDb.dbQuery('SELECT * FROM grid_cells WHERE x=91 AND y=91')
    // New columns appear (as NULL / their declared default) but nothing about
    // the pre-existing row's own data changed.
    expect(after.rows[0].id).toBe(before.rows[0].id)
    expect(after.rows[0].owner_address).toBe('0xPreMarket')
    expect(after.rows[0].title).toBe('Old Cell')
    expect(after.rows[0].service_url).toBeNull()
    expect(after.rows[0].probe_status).toBe('unprobed') // column default
  })

  it('the new columns and table are now real and usable', async () => {
    const res = await testDb.dbQuery(
      `SELECT service_url, service_method, service_desc, service_category, probe_status, probe_accepts, probed_at, evidence FROM grid_cells LIMIT 0`
    )
    expect(res.rowCount).toBe(0) // just proves the SELECT didn't throw

    await testDb.dbQuery(
      `INSERT INTO market_services (url, name, method, origin, status) VALUES ('https://example.com/svc', 'Example', 'GET', 'seed', 'candidate')`
    )
    const row = await testDb.dbQuery(`SELECT * FROM market_services WHERE url = 'https://example.com/svc'`)
    expect(row.rowCount).toBe(1)
    expect(row.rows[0].status).toBe('candidate')
  })

  it('probe_status is constrained to the four known values', async () => {
    await expect(
      testDb.dbQuery(
        `INSERT INTO grid_cells (id, x, y, probe_status, block_id, block_origin_x, block_origin_y) VALUES (7777, 77, 77, 'not_a_real_status', 'blk77', 77, 77)`
      )
    ).rejects.toBeTruthy()
  })

  it('running ensureSchema() a third time (already-migrated database) is still a no-op that throws nothing', async () => {
    await expect(ensureSchema()).resolves.toBeUndefined()
    const row = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=91 AND y=91')
    expect(row.rows[0].owner_address).toBe('0xPreMarket')
  })
})
