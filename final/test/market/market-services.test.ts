import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'
import { BASE_USDC_ADDRESS, MONAD_USDC_ADDRESS } from '../../lib/market/x402'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../../lib/db', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

// getMarketServices() only reads grid_cells: it must never probe anything itself
// (a cell's probe result is written by PUT /api/cells/update). The probe layer is
// mocked so any call would be visible; the probe's own LOGIC is covered by
// test/market/x402-probe.test.ts.
const probeHolder = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../../lib/market/service', () => ({
  probeService: (...args: unknown[]) => probeHolder.fn(...args),
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

const { getMarketServices } = await import('../../lib/market/market')
const { resetSchemaCache } = await import('../../lib/schema')

const BASE_ACCEPTS = [{ scheme: 'exact', network: 'eip155:8453', amount: '100000', asset: BASE_USDC_ADDRESS, payTo: '0xSeller' }]
const MONAD_ACCEPTS = [{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xMonadSeller' }]

interface ListingFixture {
  x: number
  y: number
  title?: string | null
  url: string
  method?: string
  desc?: string | null
  category?: string | null
  status?: string
  accepts?: unknown
}

async function addListing(f: ListingFixture) {
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, service_desc, service_category, probe_status, probe_accepts, probed_at, block_id, block_origin_x, block_origin_y)
     VALUES ($1, $2, $3, '0xSeller', $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $2, $3)`,
    [
      f.x * 100 + f.y,
      f.x,
      f.y,
      f.title ?? null,
      f.url,
      f.method ?? 'GET',
      f.desc ?? null,
      f.category ?? null,
      f.status ?? 'unprobed',
      f.accepts ? JSON.stringify(f.accepts) : null,
      `blk_${f.x}_${f.y}_1x1`,
    ]
  )
}

beforeEach(async () => {
  await testDb.reset()
  await testDb.dbQuery('DELETE FROM market_services')
  resetSchemaCache()
  probeHolder.fn.mockReset()
})

describe('lib/market/market getMarketServices — only cell listings', () => {
  it('is an empty list when no cell has a service_url (no seed, no curated entries)', async () => {
    expect(await getMarketServices({})).toEqual([])
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })

  it('a cell with a service_url shows up, carrying the cell coordinate and its stored probe result', async () => {
    await addListing({ x: 50, y: 50, title: 'My Shop', url: 'https://myshop.example.com/api', desc: 'demo listing', category: 'data', status: 'candidate', accepts: BASE_ACCEPTS })
    const entries = await getMarketServices({})
    expect(entries).toHaveLength(1)
    const listing = entries[0]
    expect(listing.source).toBe('listing')
    expect(listing.name).toBe('My Shop')
    expect(listing.url).toBe('https://myshop.example.com/api')
    expect(listing.cell).toEqual({ x: 50, y: 50 })
    expect(listing.status).toBe('can_pay')
    expect(listing.network).toBe('eip155:8453')
    expect(listing.price_usdc).toBe('0.1')
    expect(listing.networks).toEqual([{ network: 'eip155:8453', price_usdc: '0.1', payTo: '0xSeller', asset: BASE_USDC_ADDRESS }])
  })

  it('every entry is backed by a cell: nothing else (a leftover market_services row, a cell without service_url) is listed', async () => {
    await addListing({ x: 10, y: 10, title: 'Real', url: 'https://real.example.com/api', status: 'candidate', accepts: MONAD_ACCEPTS })
    // A row the old code cached from seed.json / the Bazaar sync: the table still exists but is no longer read.
    await testDb.dbQuery(
      `INSERT INTO market_services (url, name, method, origin, network, price_usdc, status, probed_at)
       VALUES ('https://seed-leftover.example.com/x', 'Seed leftover', 'GET', 'seed', 'eip155:143', '0.01', 'candidate', NOW())`
    )
    // A bought cell with no service.
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, block_id, block_origin_x, block_origin_y) VALUES (2020, 20, 20, '0xS', 'No service here', 'blk_20_20_1x1', 20, 20)`
    )
    const entries = await getMarketServices({})
    expect(entries.map((e) => e.url)).toEqual(['https://real.example.com/api'])
    for (const e of entries) {
      expect(e.source).toBe('listing')
      expect(e.cell).not.toBeNull()
    }
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })

  it('an untitled cell is named after its coordinate', async () => {
    await addListing({ x: 7, y: 9, title: null, url: 'https://untitled.example.com/api' })
    expect((await getMarketServices({}))[0].name).toBe('Cell (7,9)')
  })

  it('entries carry no on-chain evidence fields, no seller grouping and no seed origin', async () => {
    await addListing({ x: 11, y: 11, url: 'https://shape.example.com/api', status: 'candidate', accepts: BASE_ACCEPTS })
    const keys = Object.keys((await getMarketServices({}))[0])
    for (const gone of ['evidence', 'evidence_by_network', 'status_by_network', 'status_label', 'seller_id', 'origin']) expect(keys).not.toContain(gone)
  })

  it('a row the old code stored as verified (with evidence JSON still in the columns) reads as plain can_pay and the evidence is ignored', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, probe_accepts, evidence, evidence_by_network, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES (6666, 66, 66, '0xOldRow', 'legacy listing', 'https://legacy.example.com/api', 'GET', 'verified', $1, $2, $3, NOW(), 'blk_66_66_1x1', 66, 66)`,
      [
        JSON.stringify(MONAD_ACCEPTS),
        JSON.stringify({ payers_7d: 3, transfers_7d: 5, last_tx: '0xold', last_at: new Date().toISOString(), source: 'rpc-short-window', window_blocks: 600 }),
        JSON.stringify({ 'eip155:143': { network: 'eip155:143', payers: 3, transfers: 5, last_tx: '0xold', source: 'rpc-short-window' } }),
      ]
    )
    const entries = await getMarketServices({})
    const entry = entries.find((e) => e.url === 'https://legacy.example.com/api')
    expect(entry?.status).toBe('can_pay')
    expect(Object.keys(entry!)).not.toContain('evidence')
    expect(Object.keys(entry!)).not.toContain('evidence_by_network')
    expect((await getMarketServices({ status: 'can_pay' })).some((e) => e.url === 'https://legacy.example.com/api')).toBe(true)
  })

  it('failed and unprobed rows read as failed and unchecked', async () => {
    await addListing({ x: 51, y: 51, url: 'https://failed-shop.example.com/api', status: 'failed' })
    await addListing({ x: 52, y: 52, url: 'https://post-shop.example.com/api', method: 'POST', status: 'unprobed' })
    const entries = await getMarketServices({})
    expect(entries.find((e) => e.url === 'https://failed-shop.example.com/api')?.status).toBe('failed')
    expect(entries.find((e) => e.url === 'https://post-shop.example.com/api')?.status).toBe('unchecked')
  })

  it('sorts can_pay first, then unchecked, then failed', async () => {
    await addListing({ x: 1, y: 1, title: 'a-failed', url: 'https://a.example.com', status: 'failed' })
    await addListing({ x: 2, y: 2, title: 'b-unchecked', url: 'https://b.example.com', status: 'unprobed' })
    await addListing({ x: 3, y: 3, title: 'c-can-pay', url: 'https://c.example.com', status: 'candidate', accepts: BASE_ACCEPTS })
    expect((await getMarketServices({})).map((e) => e.status)).toEqual(['can_pay', 'unchecked', 'failed'])
  })

  it('a cell listing is never re-probed by getMarketServices (the owner decides when it re-probes, via PUT)', async () => {
    await addListing({ x: 53, y: 53, url: 'https://another-shop.example.com/api', status: 'candidate' })
    await getMarketServices({})
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })
})

describe('lib/market/market getMarketServices — filters', () => {
  beforeEach(async () => {
    await addListing({ x: 30, y: 30, title: 'Base Weather', url: 'https://weather.example.com/api', desc: 'forecast data', category: 'data', status: 'candidate', accepts: BASE_ACCEPTS })
    await addListing({ x: 31, y: 31, title: 'Monad Oracle', url: 'https://lingqian.example.com/qian', desc: 'fortune', category: 'fun', status: 'candidate', accepts: MONAD_ACCEPTS })
    await addListing({ x: 32, y: 32, title: 'Broken', url: 'https://broken.example.com/api', status: 'failed' })
  })

  it('filters by status=can_pay', async () => {
    const entries = await getMarketServices({ status: 'can_pay' })
    expect(entries.map((e) => e.name).sort()).toEqual(['Base Weather', 'Monad Oracle'])
    for (const e of entries) expect(e.status).toBe('can_pay')
  })

  it('the old status words match nothing (the contract is can_pay / failed / unchecked)', async () => {
    for (const old of ['verified', 'candidate', 'unprobed']) {
      expect(await getMarketServices({ status: old })).toEqual([])
    }
  })

  it('filters by network=eip155:143', async () => {
    const entries = await getMarketServices({ network: 'eip155:143' })
    expect(entries.map((e) => e.name)).toEqual(['Monad Oracle'])
    for (const e of entries) expect(e.network).toBe('eip155:143')
  })

  it('filters by q= substring match (name OR url OR description OR category)', async () => {
    expect((await getMarketServices({ q: 'lingqian' })).map((e) => e.name)).toEqual(['Monad Oracle'])
    expect((await getMarketServices({ q: 'FORECAST' })).map((e) => e.name)).toEqual(['Base Weather'])
    expect((await getMarketServices({ q: 'fun' })).map((e) => e.name)).toEqual(['Monad Oracle'])
    expect(await getMarketServices({ q: 'no-such-thing' })).toEqual([])
  })

  it('filters by category (exact, case-insensitive)', async () => {
    expect((await getMarketServices({ category: 'DATA' })).map((e) => e.name)).toEqual(['Base Weather'])
  })

  it('filters by max_price, excluding entries with no known price', async () => {
    const entries = await getMarketServices({ max_price: 0.05 })
    expect(entries.map((e) => e.name)).toEqual(['Monad Oracle'])
    for (const e of entries) expect(Number(e.price_usdc)).toBeLessThanOrEqual(0.05)
  })
})
