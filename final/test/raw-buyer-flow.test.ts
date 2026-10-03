import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { createTestDb, type TestDb } from './helpers/pglite-db'
// @ts-expect-error plain .mjs helper without type declarations
import * as B from '../scripts/lib/raw-x402-buyer.mjs'

// The taste kit's raw-private-key buyer against the real purchase / bulk-purchase handlers, in process:
// testnet mode + the dev-only mock facilitator (local signature check, no chain). Mainnet-shaped bills must
// be refused by the buyer's guard before anything is signed.

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db.js', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))
vi.mock('../lib/market/service', () => ({ probeService: vi.fn() }))

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
const flow = await import('../lib/x402-flow')
const { createMockFacilitatorPair } = await import('../lib/x402-mock-facilitator')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { PUT } = await import('../app/api/cells/update/route.js')

async function serverIn(mode: 'testnet' | 'mainnet') {
  process.env.X402_NETWORK_MODE = mode
  flow.resetSharedX402Server()
  await flow.getSharedX402Server(async () => createMockFacilitatorPair(flow.getActiveNetworks(mode)))
}

function inProcessFetch(calls: { url: string; headers: Record<string, string> }[]) {
  return async (url: string, init: any) => {
    calls.push({ url, headers: { ...(init?.headers || {}) } })
    const req = new NextRequest(url, init)
    const handler = url.includes('bulk-purchase') ? bulkPurchaseHandler : purchaseHandler
    return handler(req)
  }
}

describe('raw-key buyer, testnet server (mock facilitator)', () => {
  beforeAll(async () => {
    await serverIn('testnet')
  })

  it('bill -> guard -> sign -> pay -> key: buys a cell on Monad testnet, owner is the buyer wallet', async () => {
    const buyer = B.makeBuyer(generatePrivateKey())
    const calls: { url: string; headers: Record<string, string> }[] = []
    const r = await B.buyOnce(buyer, 'http://localhost/api/cells/purchase', { x: 70, y: 70 }, inProcessFetch(calls))
    expect(r.stage).toBe('paid')
    expect(r.status).toBe(200)
    expect(r.accept.network).toBe('eip155:10143')
    expect(r.accept.asset.toLowerCase()).toBe(B.NETWORKS['eip155:10143'].usdc.toLowerCase())
    expect(r.accept.amount).toBe('100000')
    expect(r.json.api_key).toMatch(/^gk_[0-9a-f]{32}$/)
    expect(r.settle.success).toBe(true)
    expect(r.settle.transaction).toMatch(/^0x[0-9a-f]{64}$/)
    // two requests: the unpaid one, then the same one carrying PAYMENT-SIGNATURE
    expect(calls).toHaveLength(2)
    expect(Object.keys(calls[0].headers).some((h) => h.toLowerCase().includes('payment'))).toBe(false)
    expect(Object.keys(calls[1].headers).some((h) => h.toUpperCase() === 'PAYMENT-SIGNATURE')).toBe(true)
    const owner = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=70 AND y=70')
    expect(owner.rows[0].owner_address.toLowerCase()).toBe(buyer.account.address.toLowerCase())
    // the key it got decorates the cell
    const put = await PUT(new NextRequest('http://localhost/api/cells/update', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${r.json.api_key}` }, body: JSON.stringify({ title: 'raw buyer' }) }))
    expect(put.status).toBe(200)
    const t = await testDb.dbQuery('SELECT title FROM grid_cells WHERE x=70 AND y=70')
    expect(t.rows[0].title).toBe('raw buyer')
  })

  it('the signed authorization is exactly the bill: right payTo, right amount, testnet network', async () => {
    const buyer = B.makeBuyer(generatePrivateKey())
    const bill = await B.requestBill(buyer, 'http://localhost/api/cells/purchase', { x: 71, y: 70 }, inProcessFetch([]))
    expect(bill.status).toBe(402)
    const accept = B.chooseAccept(bill.required)
    const { payload } = await B.signBill(buyer, bill.required, accept)
    const a = payload.payload.authorization
    expect(a.to.toLowerCase()).toBe(accept.payTo.toLowerCase())
    expect(a.value).toBe('100000')
    expect(a.from.toLowerCase()).toBe(buyer.account.address.toLowerCase())
    expect(payload.accepted.network).toBe('eip155:10143')
  })

  it('a full 3x2 rectangle bought through bulk-purchase by the raw buyer is one block under one key', async () => {
    const buyer = B.makeBuyer(generatePrivateKey())
    const cells = [{ x: 72, y: 71 }, { x: 73, y: 71 }, { x: 74, y: 71 }, { x: 72, y: 72 }, { x: 73, y: 72 }, { x: 74, y: 72 }]
    const r = await B.buyOnce(buyer, 'http://localhost/api/cells/bulk-purchase', { cells }, inProcessFetch([]))
    expect(r.status).toBe(200)
    expect(r.accept.amount).toBe('600000')
    expect(r.json.block).toEqual({ x: 72, y: 71, w: 3, h: 2 })
    expect(r.json.key_cell).toEqual({ x: 72, y: 71 })
    const put = await PUT(new NextRequest('http://localhost/api/cells/update', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${r.json.api_key}` }, body: JSON.stringify({ title: 'billboard' }) }))
    expect(put.status).toBe(200)
    const rows = await testDb.dbQuery("SELECT title, block_id FROM grid_cells WHERE x BETWEEN 72 AND 74 AND y BETWEEN 71 AND 72")
    expect(rows.rows).toHaveLength(6)
    for (const row of rows.rows) {
      expect(row.title).toBe('billboard')
      expect(row.block_id).toBe('blk_72_71_3x2')
    }
  })

  it('a taken cell comes back 409 before any payment is asked for (stage "bill", nothing signed)', async () => {
    await testDb.dbQuery("INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (7575, 75, 75, '0xOwner', 'blk', 75, 75)")
    const buyer = B.makeBuyer(generatePrivateKey())
    const calls: any[] = []
    const r = await B.buyOnce(buyer, 'http://localhost/api/cells/purchase', { x: 75, y: 75 }, inProcessFetch(calls))
    expect(r.stage).toBe('bill')
    expect(r.status).toBe(409)
    expect(calls).toHaveLength(1)
  })
})

describe('raw-key buyer, a MAINNET-shaped server (the guard)', () => {
  beforeAll(async () => {
    await serverIn('mainnet')
  })

  it('refuses to sign: GuardError, one request only, no payment header ever sent, nothing written', async () => {
    const buyer = B.makeBuyer(generatePrivateKey())
    const calls: { url: string; headers: Record<string, string> }[] = []
    const bill = await B.requestBill(buyer, 'http://localhost/api/cells/purchase', { x: 80, y: 80 }, inProcessFetch(calls))
    expect(bill.status).toBe(402)
    expect(bill.required.accepts.map((a: any) => a.network).sort()).toEqual(['eip155:143', 'eip155:8453'])
    await expect(B.buyOnce(buyer, 'http://localhost/api/cells/purchase', { x: 80, y: 80 }, inProcessFetch(calls))).rejects.toThrow(B.GuardError)
    // the second call made exactly one more (unpaid) request, then stopped
    expect(calls).toHaveLength(2)
    for (const c of calls) expect(Object.keys(c.headers).some((h) => h.toLowerCase().includes('payment'))).toBe(false)
    const owned = await testDb.dbQuery('SELECT 1 FROM grid_cells WHERE x=80 AND y=80 AND owner_address IS NOT NULL')
    expect(owned.rowCount).toBe(0)
  })
})
