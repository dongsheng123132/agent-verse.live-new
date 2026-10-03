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
const { BASE_NETWORK, MONAD_NETWORK, BASE_TREASURY_ADDRESS, MONAD_TREASURY_ADDRESS, getSharedX402Server, resetSharedX402Server } =
  await import('../lib/x402-flow')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
const monadFacilitator = createMockFacilitator(MONAD_NETWORK)

beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: monadFacilitator }))
})

function postRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/cells/purchase — pre-payment rejection (no 402 issued)', () => {
  it('rejects a reserved-zone cell with 403, no facilitator call', async () => {
    baseFacilitator.verify.mockClear()
    const res = await purchaseHandler(postRequest('http://localhost/api/cells/purchase', { x: 5, y: 5 }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('reserved')
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
  })

  it('rejects an already-owned cell with 409, no facilitator call', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (5050, 50, 50, '0xOwnerAlready', 'blk', 50, 50)`
    )
    baseFacilitator.verify.mockClear()
    const res = await purchaseHandler(postRequest('http://localhost/api/cells/purchase', { x: 50, y: 50 }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('cell_taken')
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
  })
})

describe('GET /api/cells/purchase — 402 accepts both networks', () => {
  it('unpaid POST returns PAYMENT-REQUIRED header with both eip155:8453 and eip155:143, correct payTo', async () => {
    const res = await purchaseHandler(postRequest('http://localhost/api/cells/purchase', { x: 60, y: 60 }))
    expect(res.status).toBe(402)
    const headerVal = res.headers.get('PAYMENT-REQUIRED')
    expect(headerVal).toBeTruthy()
    const decoded = JSON.parse(Buffer.from(headerVal as string, 'base64').toString())
    const networks = decoded.accepts.map((a: any) => a.network).sort()
    expect(networks).toEqual([BASE_NETWORK, MONAD_NETWORK].sort())
    const base = decoded.accepts.find((a: any) => a.network === BASE_NETWORK)
    const monad = decoded.accepts.find((a: any) => a.network === MONAD_NETWORK)
    expect(base.payTo).toBe(BASE_TREASURY_ADDRESS)
    expect(monad.payTo).toBe(MONAD_TREASURY_ADDRESS)
    expect(base.payTo).toBe('0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6')
    expect(monad.payTo).toBe('0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6')
  })
})

describe('POST /api/cells/purchase — verified payment flow', () => {
  it('settles on Base, owner = verified payer (not a spoofed header), ignores fake x-payment-from', async () => {
    baseFacilitator.verify.mockClear()
    baseFacilitator.settle.mockClear()
    monadFacilitator.verify.mockClear()
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a001', payTo: BASE_TREASURY_ADDRESS })
    const res = await purchaseHandler(
      postRequest('http://localhost/api/cells/purchase', { x: 20, y: 60 }, {
        'x-payment': header,
        'x-payment-from': '0xbbbb00000000000000000000000000000000b001',
      })
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.owner.toLowerCase()).toBe('0xaaaa00000000000000000000000000000000a001')
    expect(json.network).toBe(BASE_NETWORK)
    // no referral fields in the response any more
    expect(Object.keys(json).sort()).toEqual(['api_key', 'cell', 'network', 'ok', 'owner', 'receipt_id', 'tx_hash'])
    expect(baseFacilitator.verify).toHaveBeenCalledTimes(1)
    expect(baseFacilitator.settle).toHaveBeenCalledTimes(1)
    expect(monadFacilitator.verify).not.toHaveBeenCalled()
    expect(monadFacilitator.settle).not.toHaveBeenCalled()

    const cell = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [20, 60])
    expect(cell.rows[0].owner_address.toLowerCase()).toBe('0xaaaa00000000000000000000000000000000a001')
    const reservation = await testDb.dbQuery('SELECT 1 FROM cell_reservations WHERE x=$1 AND y=$2', [20, 60])
    expect(reservation.rowCount).toBe(0)
  })

  it('routes Monad payments to the Monad facilitator, not Base', async () => {
    baseFacilitator.verify.mockClear()
    monadFacilitator.verify.mockClear()
    monadFacilitator.settle.mockClear()
    const header = buildPaymentHeaderValue({ network: MONAD_NETWORK, from: '0xaaaa00000000000000000000000000000000a002', payTo: MONAD_TREASURY_ADDRESS })
    const res = await purchaseHandler(
      postRequest('http://localhost/api/cells/purchase', { x: 21, y: 60 }, { 'x-payment': header })
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.network).toBe(MONAD_NETWORK)
    expect(monadFacilitator.verify).toHaveBeenCalledTimes(1)
    expect(monadFacilitator.settle).toHaveBeenCalledTimes(1)
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
  })

  it('releases the reservation and does not write an owner when settlement fails', async () => {
    monadFacilitator.settle.mockImplementationOnce(async (_payload: any, requirements: any) => ({
      success: false,
      errorReason: 'insufficient_funds',
      transaction: '',
      network: requirements.network,
      payer: undefined,
    }))
    const header = buildPaymentHeaderValue({ network: MONAD_NETWORK, from: '0xaaaa00000000000000000000000000000000a003', payTo: MONAD_TREASURY_ADDRESS })
    const res = await purchaseHandler(
      postRequest('http://localhost/api/cells/purchase', { x: 22, y: 60 }, { 'x-payment': header })
    )
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.error).toBe('settlement_failed')

    const cell = await testDb.dbQuery('SELECT 1 FROM grid_cells WHERE x=$1 AND y=$2 AND owner_address IS NOT NULL', [22, 60])
    expect(cell.rowCount).toBe(0)
    const reservation = await testDb.dbQuery('SELECT 1 FROM cell_reservations WHERE x=$1 AND y=$2', [22, 60])
    expect(reservation.rowCount).toBe(0)
  })

  it('two concurrent payments for the same cell: exactly one settles, the other gets 409 and is never settled', async () => {
    baseFacilitator.settle.mockClear()
    const h1 = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a004', payTo: BASE_TREASURY_ADDRESS })
    const h2 = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a005', payTo: BASE_TREASURY_ADDRESS })

    const [r1, r2] = await Promise.all([
      purchaseHandler(postRequest('http://localhost/api/cells/purchase', { x: 23, y: 60 }, { 'x-payment': h1 })),
      purchaseHandler(postRequest('http://localhost/api/cells/purchase', { x: 23, y: 60 }, { 'x-payment': h2 })),
    ])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(baseFacilitator.settle).toHaveBeenCalledTimes(1)

    const cellRows = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [23, 60])
    expect(cellRows.rowCount).toBe(1)
    const reservation = await testDb.dbQuery('SELECT 1 FROM cell_reservations WHERE x=$1 AND y=$2', [23, 60])
    expect(reservation.rowCount).toBe(0)
  })
})
