import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db.js', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))
// PUT /api/cells/update imports the service probe; these tests only send title / fill_color.
vi.mock('../lib/market/service', () => ({ probeServiceAndEvidence: vi.fn() }))

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
const { PUT } = await import('../app/api/cells/update/route.js')

beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: createMockFacilitator(BASE_NETWORK), monad: createMockFacilitator('eip155:143') }))
})

const PAYER = '0xaaaa00000000000000000000000000000000b10c'
let seq = 0

async function buy(cells: { x: number; y: number }[]) {
  seq += 1
  const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: PAYER, nonce: `0xblocknonce${seq}${Date.now()}` })
  const res = await bulkPurchaseHandler(
    new NextRequest('http://localhost/api/cells/bulk-purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-payment': header },
      body: JSON.stringify({ cells }),
    })
  )
  return { status: res.status, json: await res.json() }
}

async function putUpdate(apiKey: string, body: unknown) {
  const res = await PUT(
    new NextRequest('http://localhost/api/cells/update', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
  )
  return { status: res.status, json: await res.json() }
}

async function rows(cells: { x: number; y: number }[]) {
  const out: any[] = []
  for (const c of cells) {
    const r = await testDb.dbQuery('SELECT x, y, title, fill_color, block_id, block_w, block_h, block_origin_x, block_origin_y FROM grid_cells WHERE x=$1 AND y=$2', [c.x, c.y])
    out.push(r.rows[0])
  }
  return out
}

describe('bulk-purchase: a full rectangle becomes one block', () => {
  // 3 x 2 block at (30,70), sent in a scrambled order on purpose: the key must go to the origin, not to cells[0]
  const rect = [{ x: 32, y: 71 }, { x: 30, y: 70 }, { x: 31, y: 70 }, { x: 32, y: 70 }, { x: 30, y: 71 }, { x: 31, y: 71 }]
  const sorted = [...rect].sort((a, b) => a.y - b.y || a.x - b.x)

  it('writes every cell with the same block_id / w / h / origin and returns key_cell + block', async () => {
    const { status, json } = await buy(rect)
    expect(status).toBe(200)
    expect(json.count).toBe(6)
    expect(json.key_cell).toEqual({ x: 30, y: 70 })
    expect(json.block).toEqual({ x: 30, y: 70, w: 3, h: 2 })
    for (const r of await rows(sorted)) {
      expect(r.block_id).toBe('blk_30_70_3x2')
      expect(r.block_w).toBe(3)
      expect(r.block_h).toBe(2)
      expect(r.block_origin_x).toBe(30)
      expect(r.block_origin_y).toBe(70)
    }
  })

  it('stores exactly one key, for the origin cell', async () => {
    const { json } = await buy(rect)
    const keys = await testDb.dbQuery('SELECT x, y FROM cell_api_keys ORDER BY y, x')
    expect(keys.rows).toEqual([{ x: 30, y: 70 }])
    expect(json.api_key).toMatch(/^gk_[0-9a-f]{32}$/)
  })

  it('PUT with that one key changes the title (and colour) on EVERY cell of the block', async () => {
    const { json } = await buy(rect)
    const put = await putUpdate(json.api_key, { title: 'Whole block', fill_color: '#ff8800' })
    expect(put.status).toBe(200)
    const after = await rows(sorted)
    expect(after).toHaveLength(6)
    for (const r of after) {
      expect(r.title).toBe('Whole block')
      expect(r.fill_color).toBe('#ff8800')
    }
  })

  it('the update does not leak into a neighbouring block bought separately', async () => {
    const a = await buy(rect)
    const neighbour = [{ x: 33, y: 70 }, { x: 34, y: 70 }]
    const b = await buy(neighbour)
    expect(b.json.block).toEqual({ x: 33, y: 70, w: 2, h: 1 })
    await putUpdate(a.json.api_key, { title: 'A only' })
    for (const r of await rows(neighbour)) expect(r.title).toBeNull()
    for (const r of await rows(sorted)) expect(r.title).toBe('A only')
  })

  it('a single cell sent to bulk-purchase is a 1x1 block with its own key', async () => {
    const { json } = await buy([{ x: 60, y: 80 }])
    expect(json.block).toEqual({ x: 60, y: 80, w: 1, h: 1 })
    expect(json.key_cell).toEqual({ x: 60, y: 80 })
    const [r] = await rows([{ x: 60, y: 80 }])
    expect(r.block_id).toBe('blk_60_80_1x1')
    const put = await putUpdate(json.api_key, { title: 'solo' })
    expect(put.status).toBe(200)
    expect((await rows([{ x: 60, y: 80 }]))[0].title).toBe('solo')
  })
})

describe('bulk-purchase: not a full rectangle keeps the old behaviour', () => {
  // an L shape: 3 cells inside a 2 x 2 box
  const ell = [{ x: 40, y: 75 }, { x: 41, y: 75 }, { x: 40, y: 76 }]

  it('every cell stays its own 1x1 block, the key belongs to the first cell, block is null', async () => {
    const { status, json } = await buy(ell)
    expect(status).toBe(200)
    expect(json.block).toBeNull()
    expect(json.key_cell).toEqual({ x: 40, y: 75 })
    for (const r of await rows(ell)) {
      expect(r.block_id).toBe(`blk_${r.x}_${r.y}_1x1`)
      expect(r.block_w).toBe(1)
      expect(r.block_h).toBe(1)
      expect(r.block_origin_x).toBe(r.x)
      expect(r.block_origin_y).toBe(r.y)
    }
    const keys = await testDb.dbQuery('SELECT x, y FROM cell_api_keys')
    expect(keys.rows).toEqual([{ x: 40, y: 75 }])
  })

  it('PUT with the key decorates only the first cell', async () => {
    const { json } = await buy(ell)
    const put = await putUpdate(json.api_key, { title: 'just one' })
    expect(put.status).toBe(200)
    const after = await rows(ell)
    expect(after.map((r) => r.title)).toEqual(['just one', null, null])
  })

  it('a rectangle with a hole (3x3 minus the middle) is not a block', async () => {
    const ring = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: 50 + dx, y: 80 + dy }))).filter((c) => !(c.x === 50 && c.y === 80))
    const { json } = await buy(ring)
    expect(json.block).toBeNull()
    const [corner] = await rows([{ x: 49, y: 79 }])
    expect(corner.block_id).toBe('blk_49_79_1x1')
  })
})
