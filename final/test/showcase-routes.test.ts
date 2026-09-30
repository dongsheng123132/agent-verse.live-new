import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

// /api/grid + /api/cells merge the Monad Metropolis showcase in; purchase /
// bulk-purchase / regen-key / commerce-create refuse showcase coordinates with
// 403 reserved_showcase before any 402 is issued.

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
  resetShowcaseSkipLog()
})

const { NextRequest } = await import('next/server')
const { BASE_NETWORK, BASE_TREASURY_ADDRESS, getSharedX402Server, resetSharedX402Server } = await import('../lib/x402-flow')
const { GET: gridGET } = await import('../app/api/grid/route.js')
const { GET: cellsGET } = await import('../app/api/cells/route.js')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { regenHandler } = await import('../app/api/cells/regen-key/handler')
const { POST: commerceCreate } = await import('../app/api/commerce/create/route.js')
const { SHOWCASE_BLOCKS, SHOWCASE_BOUNDS, resetShowcaseSkipLog } = await import('../lib/showcase/index')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: createMockFacilitator('eip155:143') }))
})

const AREA = (SHOWCASE_BOUNDS.x1 - SHOWCASE_BOUNDS.x0 + 1) * (SHOWCASE_BOUNDS.y1 - SHOWCASE_BOUNDS.y0 + 1)
const nansen = SHOWCASE_BLOCKS.find((b) => b.id === 'sponsor-nansen')!

async function own(x: number, y: number, owner: string) {
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y, title) VALUES ($1,$2,$3,$4,'blk',$2,$3,$5)`,
    [y * 100 + x, x, y, owner, `cell ${x},${y}`]
  )
}

const get = (path: string) => new NextRequest(`http://localhost${path}`)
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('GET /api/grid — showcase merge', () => {
  it('adds every showcase cell (showcase:true, block info) to an otherwise empty map', async () => {
    const rows = await (await gridGET()).json()
    const virtual = rows.filter((r: any) => r.showcase)
    expect(virtual).toHaveLength(AREA)
    const arenaOrigin = virtual.find((r: any) => r.x === 58 && r.y === 40)
    expect(arenaOrigin).toMatchObject({
      title: 'Monad Metropolis 比武台',
      block_w: 16,
      block_h: 8,
      block_origin_x: 58,
      block_origin_y: 40,
      showcase_kind: 'arena',
      color: '#6E54FF',
    })
  })

  it('leaves real users alone, replaces 0xRESERVED / official rows under the showcase', async () => {
    await own(10, 60, '0xUserFarAway')
    await own(60, 42, '0xRESERVED')
    await own(61, 42, '0xAgentVerseOfficial')
    const rows = await (await gridGET()).json()
    expect(rows.filter((r: any) => r.x === 10 && r.y === 60)[0].owner).toBe('0xUserFarAway')
    const at = (x: number, y: number) => rows.filter((r: any) => r.x === x && r.y === y)
    expect(at(60, 42)).toHaveLength(1)
    expect(at(60, 42)[0].showcase).toBe(true)
    expect(at(61, 42)).toHaveLength(1)
    expect(at(61, 42)[0].showcase).toBe(true)
  })

  it('a real user inside one block: that block is skipped and logged, the user cell is kept, the rest still shows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await own(nansen.x + 1, nansen.y + 1, '0x5c5869bceb4c4eb3fa1dcdeebd84e9890dbc01af')
      const rows = await (await gridGET()).json()
      const userRows = rows.filter((r: any) => r.x === nansen.x + 1 && r.y === nansen.y + 1)
      expect(userRows).toHaveLength(1)
      expect(userRows[0].showcase).toBeUndefined()
      expect(userRows[0].owner).toBe('0x5c5869bceb4c4eb3fa1dcdeebd84e9890dbc01af')
      // no other cell of the skipped block is drawn
      expect(rows.filter((r: any) => r.showcase && r.block_id === 'showcase:sponsor-nansen')).toHaveLength(0)
      // everything else is still there
      expect(rows.filter((r: any) => r.showcase)).toHaveLength(AREA - nansen.w * nansen.h)
      expect(rows.some((r: any) => r.showcase && r.block_id === 'showcase:metropolis-arena')).toBe(true)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('skipping block "sponsor-nansen"')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('GET /api/cells — showcase detail', () => {
  it('answers a showcase origin with the full block detail', async () => {
    const json = await (await cellsGET(get('/api/cells?x=58&y=40'))).json()
    expect(json.ok).toBe(true)
    expect(json.cell.showcase).toBe(true)
    expect(json.cell.title).toBe('Monad Metropolis 比武台')
    expect(json.cell.markdown).toContain('Trust, Identity & AI Infrastructure')
    expect(json.cell.showcase_footnote).toBe('信息整理自黑客松公开资料，非官方合作/背书')
  })

  it('answers other cells of a block with block info only (the client re-fetches the origin)', async () => {
    const json = await (await cellsGET(get('/api/cells?x=59&y=41'))).json()
    expect(json.cell.showcase).toBe(true)
    expect(json.cell.block_origin_x).toBe(58)
    expect(json.cell.markdown).toBeUndefined()
  })

  it('a service slot detail carries the service fields', async () => {
    const ling = SHOWCASE_BLOCKS.find((b) => b.id === 'svc-lingqian')!
    const json = await (await cellsGET(get(`/api/cells?x=${ling.x}&y=${ling.y}`))).json()
    expect(json.cell.service_url).toBe('https://monad-lingqian.vercel.app/qian')
    expect(json.cell.iframe_url).toBe('https://monad-lingqian.vercel.app')
  })

  it('a real user cell wins; a skipped block is not shown; outside the footprint is untouched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ux = nansen.x + 1
      const uy = nansen.y + 1
      await own(ux, uy, '0xRealUser')
      await own(10, 60, '0xUserFarAway')
      const user = await (await cellsGET(get(`/api/cells?x=${ux}&y=${uy}`))).json()
      expect(user.cell.owner).toBe('0xRealUser')
      expect(user.cell.showcase).toBeUndefined()
      const sameBlock = await (await cellsGET(get(`/api/cells?x=${nansen.x}&y=${nansen.y}`))).json()
      expect(sameBlock.cell).toBeNull()
      const far = await (await cellsGET(get('/api/cells?x=10&y=60'))).json()
      expect(far.cell.owner).toBe('0xUserFarAway')
      const empty = await (await cellsGET(get('/api/cells?x=57&y=40'))).json()
      expect(empty.cell).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('purchase routes refuse showcase coordinates with 403 reserved_showcase, before any 402', () => {
  afterEach(() => {
    baseFacilitator.verify.mockClear()
    baseFacilitator.settle.mockClear()
  })
  const paid = () => ({ 'x-payment': buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a301', payTo: BASE_TREASURY_ADDRESS }) })

  it('POST /api/cells/purchase', async () => {
    for (const [x, y] of [[58, 40], [65, 47], [81, 56], [70, 50]]) {
      const res = await purchaseHandler(post('/api/cells/purchase', { x, y }))
      expect(res.status, `(${x},${y})`).toBe(403)
      expect((await res.json()).error).toBe('reserved_showcase')
      expect(res.headers.get('PAYMENT-REQUIRED')).toBeNull()
    }
    // even with a valid payment attached nothing is verified or settled
    const withPayment = await purchaseHandler(post('/api/cells/purchase', { x: 60, y: 42 }, paid()))
    expect(withPayment.status).toBe(403)
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
    expect(baseFacilitator.settle).not.toHaveBeenCalled()
    const owned = await testDb.dbQuery('SELECT 1 FROM grid_cells WHERE owner_address IS NOT NULL')
    expect(owned.rowCount).toBe(0)
  })

  it('POST /api/cells/purchase still issues the normal 402 one cell outside the footprint', async () => {
    for (const [x, y] of [[57, 40], [82, 40], [58, 39], [58, 57]]) {
      const res = await purchaseHandler(post('/api/cells/purchase', { x, y }))
      expect(res.status, `(${x},${y})`).toBe(402)
    }
  })

  it('POST /api/cells/bulk-purchase (one showcase cell anywhere in the batch rejects the whole batch)', async () => {
    const res = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells: [{ x: 56, y: 40 }, { x: 57, y: 40 }, { x: 58, y: 40 }] }, paid()))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('reserved_showcase')
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
    expect(baseFacilitator.settle).not.toHaveBeenCalled()
    // a batch entirely outside is still a normal 402
    const outside = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells: [{ x: 56, y: 40 }, { x: 57, y: 40 }] }))
    expect(outside.status).toBe(402)
  })

  it('POST /api/cells/regen-key', async () => {
    const res = await regenHandler(post('/api/cells/regen-key', { x: 60, y: 42 }, paid()))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('reserved_showcase')
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
    expect(baseFacilitator.settle).not.toHaveBeenCalled()
  })

  it('POST /api/commerce/create (Coinbase Commerce path), both the cells[] and the legacy single-block flow', async () => {
    const prev = process.env.COMMERCE_API_KEY
    process.env.COMMERCE_API_KEY = 'test-key-never-used'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not reach Coinbase'))
    try {
      const multi = await commerceCreate(post('/api/commerce/create', { cells: [{ x: 58, y: 40 }] }))
      expect(multi.status).toBe(403)
      expect((await multi.json()).error).toBe('reserved_showcase')
      const legacy = await commerceCreate(post('/api/commerce/create', { x: 57, y: 40, block_w: 2, block_h: 1 }))
      expect(legacy.status).toBe(403)
      expect((await legacy.json()).error).toBe('reserved_showcase')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      if (prev === undefined) delete process.env.COMMERCE_API_KEY
      else process.env.COMMERCE_API_KEY = prev
    }
  })
})
