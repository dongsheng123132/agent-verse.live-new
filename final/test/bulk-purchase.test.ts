import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb()
  dbHolder.db = testDb
  process.env.DATABASE_URL = 'postgres://test-fake-not-used'
})
afterAll(async () => {
  await testDb.close()
})
beforeEach(async () => {
  await testDb.reset()
})

const { NextRequest } = await import('next/server')
const { BASE_NETWORK, getSharedX402Server, resetSharedX402Server } = await import('../lib/x402-flow')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: createMockFacilitator('eip155:143') }))
})

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cells/bulk-purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/cells/bulk-purchase', () => {
  it('rejects >400 cells with 400, no facilitator call', async () => {
    const cells = Array.from({ length: 401 }, (_, i) => ({ x: (i % 84) + 16, y: Math.floor(i / 84) + 16 }))
    baseFacilitator.verify.mockClear()
    const res = await bulkPurchaseHandler(postRequest({ cells }))
    expect(res.status).toBe(400)
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
  })

  it('rejects the whole batch with 409 (no payment requested) if any cell is already owned', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (8080, 80, 80, '0xOwner', 'blk', 80, 80)`
    )
    baseFacilitator.verify.mockClear()
    const res = await bulkPurchaseHandler(postRequest({ cells: [{ x: 80, y: 80 }, { x: 81, y: 80 }] }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('cells_taken')
    expect(baseFacilitator.verify).not.toHaveBeenCalled()

    const untouched = await testDb.dbQuery('SELECT 1 FROM grid_cells WHERE x=$1 AND y=$2 AND owner_address IS NOT NULL', [81, 80])
    expect(untouched.rowCount).toBe(0)
  })

  it('all-or-nothing: settles once and writes every cell with the verified payer as owner', async () => {
    baseFacilitator.settle.mockClear()
    const cells = [{ x: 30, y: 60 }, { x: 31, y: 60 }, { x: 30, y: 61 }, { x: 31, y: 61 }]
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a006' })
    const res = await bulkPurchaseHandler(postRequest({ cells }, { 'x-payment': header }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(4)
    expect(json.total_usdc).toBeCloseTo(0.4)
    // no referral fields in the response any more
    expect(Object.keys(json).sort()).toEqual(['api_key', 'block', 'cells', 'count', 'key_cell', 'network', 'ok', 'owner', 'receipt_id', 'total_usdc', 'tx_hash'])
    expect(baseFacilitator.settle).toHaveBeenCalledTimes(1)

    for (const c of cells) {
      const row = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [c.x, c.y])
      expect(row.rows[0].owner_address.toLowerCase()).toBe('0xaaaa00000000000000000000000000000000a006')
    }
    const reservations = await testDb.dbQuery('SELECT 1 FROM cell_reservations')
    expect(reservations.rowCount).toBe(0)
  })

  it('all-or-nothing under a race: if one cell in the batch loses its reservation, none are settled or written', async () => {
    // Pre-seed a reservation on one of the target cells to simulate a
    // concurrent single-cell purchase winning that cell first.
    await testDb.dbQuery(
      `INSERT INTO cell_reservations (x, y, nonce, payer, network, expires_at) VALUES ($1,$2,'rival','0xRival','eip155:8453', NOW() + interval '60 seconds')`,
      [41, 60]
    )
    baseFacilitator.settle.mockClear()
    const cells = [{ x: 40, y: 60 }, { x: 41, y: 60 }]
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a007' })
    const res = await bulkPurchaseHandler(postRequest({ cells }, { 'x-payment': header }))
    expect(res.status).toBe(409)
    expect(baseFacilitator.settle).not.toHaveBeenCalled()

    const cell40 = await testDb.dbQuery('SELECT 1 FROM grid_cells WHERE x=40 AND y=60 AND owner_address IS NOT NULL')
    expect(cell40.rowCount).toBe(0)
    // The rival's original reservation on (41,60) must still be intact — our
    // failed batch must not have deleted someone else's live reservation.
    const rivalReservation = await testDb.dbQuery("SELECT payer FROM cell_reservations WHERE x=41 AND y=60")
    expect(rivalReservation.rowCount).toBe(1)
    expect(rivalReservation.rows[0].payer).toBe('0xRival')
  })
})
