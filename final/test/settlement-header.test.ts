import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

// x402 settlement receipt header. MoneySwitch records a payment as settled from
// PAYMENT-RESPONSE (v2) / X-PAYMENT-RESPONSE (v1); without it the payment shows
// up as "unknown / NO_SETTLE_HEADER" even though it settled. Success responses of
// purchase / bulk-purchase / regen-key must carry it; 402 / 403 / 404 / 409 /
// settlement-failed responses must not.

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db.js', () => ({
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
const { BASE_NETWORK, BASE_TREASURY_ADDRESS, getSharedX402Server, resetSharedX402Server } = await import('../lib/x402-flow')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { regenHandler } = await import('../app/api/cells/regen-key/handler')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: createMockFacilitator('eip155:143') }))
})

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const settleHeader = (res: Response) => res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE')

function decodeReceipt(res: Response) {
  const receipt = settleHeader(res)
  expect(receipt).toBeTruthy()
  return JSON.parse(Buffer.from(receipt as string, 'base64').toString())
}

function pay(from: string) {
  return { 'x-payment': buildPaymentHeaderValue({ network: BASE_NETWORK, from, payTo: BASE_TREASURY_ADDRESS }) }
}

async function ownCell(x: number, y: number, owner: string) {
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES ($1,$2,$3,$4,'blk',$2,$3)`,
    [y * 100 + x, x, y, owner]
  )
}

async function reserve(x: number, y: number) {
  await testDb.dbQuery(
    `INSERT INTO cell_reservations (x, y, nonce, payer, network, expires_at) VALUES ($1,$2,'rival','0xRival','eip155:8453', NOW() + interval '60 seconds')`,
    [x, y]
  )
}

describe('POST /api/cells/purchase — settlement receipt header', () => {
  it('is present on a settled purchase and carries the settled transaction', async () => {
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 24, y: 60 }, pay('0xaaaa00000000000000000000000000000000a101')))
    expect(res.status).toBe(200)
    const json = await res.json()
    const decoded = decodeReceipt(res)
    expect(decoded.success).toBe(true)
    expect(decoded.transaction).toBe(json.tx_hash)
  })

  it('is absent on the 402 payment challenge', async () => {
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 25, y: 60 }))
    expect(res.status).toBe(402)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on a pre-payment 409 (cell already owned)', async () => {
    await ownCell(26, 60, '0xOwnerAlready')
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 26, y: 60 }))
    expect(res.status).toBe(409)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on a post-verify 409 (lost the reservation race, never settled)', async () => {
    await reserve(27, 60)
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 27, y: 60 }, pay('0xaaaa00000000000000000000000000000000a102')))
    expect(res.status).toBe(409)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent when settlement fails', async () => {
    baseFacilitator.settle.mockImplementationOnce(async (_payload: any, requirements: any) => ({
      success: false,
      errorReason: 'insufficient_funds',
      transaction: '',
      network: requirements.network,
      payer: undefined,
    }))
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 28, y: 60 }, pay('0xaaaa00000000000000000000000000000000a103')))
    expect(res.status).toBe(402)
    expect(settleHeader(res)).toBeNull()
  })
})

describe('POST /api/cells/bulk-purchase — settlement receipt header', () => {
  it('is present on a settled bulk purchase and carries the settled transaction', async () => {
    const cells = [{ x: 50, y: 70 }, { x: 51, y: 70 }]
    const res = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells }, pay('0xaaaa00000000000000000000000000000000a201')))
    expect(res.status).toBe(200)
    const json = await res.json()
    const decoded = decodeReceipt(res)
    expect(decoded.success).toBe(true)
    expect(decoded.transaction).toBe(json.tx_hash)
  })

  it('is absent on the 402 payment challenge', async () => {
    const res = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells: [{ x: 52, y: 70 }, { x: 53, y: 70 }] }))
    expect(res.status).toBe(402)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on a pre-payment 409 (a cell is already owned)', async () => {
    await ownCell(54, 70, '0xOwner')
    const res = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells: [{ x: 54, y: 70 }, { x: 55, y: 70 }] }))
    expect(res.status).toBe(409)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on a post-verify 409 (lost the reservation race, never settled)', async () => {
    await reserve(57, 70)
    const res = await bulkPurchaseHandler(
      post('/api/cells/bulk-purchase', { cells: [{ x: 56, y: 70 }, { x: 57, y: 70 }] }, pay('0xaaaa00000000000000000000000000000000a202'))
    )
    expect(res.status).toBe(409)
    expect(settleHeader(res)).toBeNull()
  })
})

describe('POST /api/cells/regen-key — settlement receipt header', () => {
  const OWNER = '0xaaaa00000000000000000000000000000000a008'

  it('is present on a settled key regeneration and carries the settled transaction', async () => {
    await ownCell(70, 70, OWNER)
    const res = await regenHandler(post('/api/cells/regen-key', { x: 70, y: 70 }, pay(OWNER)))
    expect(res.status).toBe(200)
    const json = await res.json()
    const decoded = decodeReceipt(res)
    expect(decoded.success).toBe(true)
    expect(decoded.transaction).toBe(json.tx_hash)
  })

  it('is absent on the 402 payment challenge', async () => {
    await ownCell(70, 70, OWNER)
    const res = await regenHandler(post('/api/cells/regen-key', { x: 70, y: 70 }))
    expect(res.status).toBe(402)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on a 404 (cell has no owner, no payment requested)', async () => {
    const res = await regenHandler(post('/api/cells/regen-key', { x: 71, y: 71 }))
    expect(res.status).toBe(404)
    expect(settleHeader(res)).toBeNull()
  })

  it('is absent on the 403 not_owner rejection (payment cancelled, never settled)', async () => {
    await ownCell(70, 70, OWNER)
    const res = await regenHandler(post('/api/cells/regen-key', { x: 70, y: 70 }, pay('0xbbbb00000000000000000000000000000000b009')))
    expect(res.status).toBe(403)
    expect(settleHeader(res)).toBeNull()
  })
})
