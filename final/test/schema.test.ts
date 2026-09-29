import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, SCHEMA_SQL, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

// A snapshot of the "old" (pre-migration) schema: everything in
// scripts/init-db.sql up to (not including) the "x402 dual-chain
// settlement" migration block that added grid_orders.network,
// grid_orders.payer_address, and the cell_reservations table + its index.
// This is exactly what a production database looks like before
// lib/schema.ts's ensureSchema() has ever run against it.
const MIGRATION_MARKER = '-- x402 dual-chain settlement'
const markerIndex = SCHEMA_SQL.indexOf(MIGRATION_MARKER)
if (markerIndex === -1) {
  throw new Error(
    'scripts/init-db.sql no longer contains the expected "-- x402 dual-chain settlement" marker comment; update this test to match the new file structure'
  )
}
const OLD_SCHEMA_SQL = SCHEMA_SQL.slice(0, markerIndex)

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db.js', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb(OLD_SCHEMA_SQL)
  dbHolder.db = testDb
  process.env.DATABASE_URL = 'postgres://test-fake-not-used'
  // Data that existed on the old schema before ensureSchema() ever ran —
  // must survive completely untouched by the migration.
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (9090, 90, 90, '0xPreExisting', 'blk', 90, 90)`
  )
})
afterAll(async () => {
  await testDb.close()
})

const { NextRequest } = await import('next/server')
const { BASE_NETWORK, getSharedX402Server, resetSharedX402Server } = await import('../lib/x402-flow')
const { ensureSchema, resetSchemaCache } = await import('../lib/schema')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: createMockFacilitator('eip155:143') }))
})

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cells/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('lib/schema.ts ensureSchema() migrating a pre-migration database', () => {
  it('sanity check: the seeded old schema really is missing the new objects', async () => {
    await expect(testDb.dbQuery(`SELECT network FROM grid_orders LIMIT 1`)).rejects.toBeTruthy()
    await expect(testDb.dbQuery(`SELECT 1 FROM cell_reservations LIMIT 1`)).rejects.toBeTruthy()
  })

  it('ensureSchema() runs twice without error and does not mutate pre-existing grid data', async () => {
    resetSchemaCache()
    const before = await testDb.dbQuery('SELECT * FROM grid_cells WHERE x=90 AND y=90')

    await expect(ensureSchema()).resolves.toBeUndefined()
    await expect(ensureSchema()).resolves.toBeUndefined()

    const after = await testDb.dbQuery('SELECT * FROM grid_cells WHERE x=90 AND y=90')
    expect(after.rows).toEqual(before.rows)

    // The new objects are now real and usable.
    await expect(testDb.dbQuery(`SELECT network, payer_address FROM grid_orders LIMIT 0`)).resolves.toBeTruthy()
    await testDb.dbQuery(
      `INSERT INTO cell_reservations (x, y, nonce, payer, network, expires_at) VALUES (1, 1, 'n', 'p', 'eip155:8453', NOW() + interval '60 seconds')`
    )
    const reservation = await testDb.dbQuery('SELECT 1 FROM cell_reservations WHERE x=1 AND y=1')
    expect(reservation.rowCount).toBe(1)
    await testDb.dbQuery('DELETE FROM cell_reservations WHERE x=1 AND y=1')
  })

  it('the purchase flow works normally after the schema is ensured', async () => {
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a009' })
    const res = await purchaseHandler(postRequest({ x: 92, y: 92 }, { 'x-payment': header }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.owner.toLowerCase()).toBe('0xaaaa00000000000000000000000000000000a009')

    const order = await testDb.dbQuery('SELECT network, payer_address FROM grid_orders WHERE x=92 AND y=92')
    expect(order.rows[0].network).toBe(BASE_NETWORK)
    expect(order.rows[0].payer_address.toLowerCase()).toBe('0xaaaa00000000000000000000000000000000a009')
    const reservation = await testDb.dbQuery('SELECT 1 FROM cell_reservations WHERE x=92 AND y=92')
    expect(reservation.rowCount).toBe(0)

    // The cell that pre-existed before ensureSchema() ran is still exactly as it was.
    const pre = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=90 AND y=90')
    expect(pre.rows[0].owner_address).toBe('0xPreExisting')
  })
})
