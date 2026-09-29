import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../../lib/db.js', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

// No real network: Bazaar sync returns nothing, and the probe/evidence layer
// is driven entirely by this fixture so official-candidate probing (seed.json,
// 13 entries) is deterministic and offline. seed.json's own probe/evidence
// LOGIC is covered by test/market/x402-probe-evidence.test.ts — this file is
// about getMarketServices()'s aggregation/cache/filter/sort behavior.
vi.mock('../../lib/market/bazaar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/market/bazaar')>()
  return { ...actual, fetchBazaarResources: vi.fn(async () => []) }
})

const probeHolder = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../../lib/market/service', () => ({
  probeServiceAndEvidence: (...args: unknown[]) => probeHolder.fn(...args),
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

const NOW = new Date().toISOString()

function fixtureProbe(url: string, method: string) {
  if (method !== 'GET') {
    return { status: 'unprobed', accepts: null, network: null, price_usdc: null, pay_to: null, evidence: null, probed_at: null, note: '' }
  }
  if (url.includes('monad-lingqian')) {
    return {
      status: 'verified',
      accepts: [{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: '0xUsdcMonad', payTo: '0xLingqianPay' }],
      network: 'eip155:143',
      price_usdc: '0.01',
      pay_to: '0xLingqianPay',
      evidence: { payers_7d: 2, transfers_7d: 4, last_tx: '0xtx1', last_at: NOW, source: 'rpc-short-window', window_blocks: 606 },
      probed_at: NOW,
      note: '',
    }
  }
  if (url.includes('nansen.ai')) {
    return {
      status: 'candidate',
      accepts: [{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: '0xUsdcMonad', payTo: '0xNansenPay' }],
      network: 'eip155:143',
      price_usdc: '0.01',
      pay_to: '0xNansenPay',
      evidence: null,
      probed_at: NOW,
      note: '',
    }
  }
  return { status: 'failed', accepts: null, network: null, price_usdc: null, pay_to: null, evidence: null, probed_at: NOW, note: 'no match' }
}

beforeEach(async () => {
  await testDb.reset()
  await testDb.dbQuery('DELETE FROM market_services')
  resetSchemaCache()
  probeHolder.fn.mockReset()
  probeHolder.fn.mockImplementation(async (url: string, method: string) => fixtureProbe(url, method))
})

describe('lib/market/market getMarketServices — cold start + official candidates', () => {
  it('probes every seed.json candidate on a cold start (empty market_services) and returns them all', async () => {
    const entries = await getMarketServices({})
    // seed.json has 13 entries (see lib/market/seed.json); none from Bazaar (mocked empty).
    const official = entries.filter((e) => e.source === 'official')
    expect(official.length).toBe(13)
    expect(probeHolder.fn).toHaveBeenCalledTimes(13)
  })

  it('sorts verified before candidate before failed/unprobed', async () => {
    const entries = await getMarketServices({})
    const statuses = entries.map((e) => e.status)
    const firstCandidateIdx = statuses.indexOf('candidate')
    const firstVerifiedIdx = statuses.indexOf('verified')
    const firstFailedIdx = statuses.indexOf('failed')
    expect(firstVerifiedIdx).toBeLessThan(firstCandidateIdx)
    expect(firstCandidateIdx).toBeLessThan(firstFailedIdx)
  })

  it('does not re-probe on a second call within the 30-minute staleness window (cache hit)', async () => {
    await getMarketServices({})
    probeHolder.fn.mockClear()
    await getMarketServices({})
    // Background refresh is fire-and-forget and only touches *stale* rows;
    // rows probed moments ago are not stale, so no new probe call is made
    // synchronously. (We don't await the fire-and-forget refresh here.)
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })
})

describe('lib/market/market getMarketServices — filters', () => {
  it('filters by status=verified', async () => {
    const entries = await getMarketServices({ status: 'verified' })
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(e.status).toBe('verified')
    expect(entries.some((e) => e.name === 'Monad 灵签')).toBe(true)
  })

  it('filters by network=eip155:143', async () => {
    const entries = await getMarketServices({ network: 'eip155:143' })
    for (const e of entries) expect(e.network).toBe('eip155:143')
  })

  it('filters by q= substring match (name OR url OR description OR category)', async () => {
    const entries = await getMarketServices({ q: 'lingqian' })
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(e.url.toLowerCase()).toContain('lingqian')
  })

  it('filters by max_price, excluding entries with no known price', async () => {
    const entries = await getMarketServices({ max_price: 0.05 })
    for (const e of entries) {
      expect(e.price_usdc).not.toBeNull()
      expect(Number(e.price_usdc)).toBeLessThanOrEqual(0.05)
    }
  })
})

describe('lib/market/market getMarketServices — cell listings', () => {
  it('includes a grid_cells service listing alongside official entries', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, service_desc, service_category, probe_status, probe_accepts, evidence, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES (5050, 50, 50, '0xSeller', 'My Shop', 'https://myshop.example.com/api', 'GET', 'demo listing', 'data', 'verified',
               $1, $2, NOW(), 'blk_50_50_1x1', 50, 50)`,
      [
        JSON.stringify([{ scheme: 'exact', network: 'eip155:8453', amount: '100000', asset: '0xUsdcBase', payTo: '0xSeller' }]),
        JSON.stringify({ payers_7d: 1, transfers_7d: 1, last_tx: '0xshoptx', last_at: NOW, source: 'rpc-short-window', window_blocks: 6000 }),
      ]
    )
    const entries = await getMarketServices({})
    const listing = entries.find((e) => e.source === 'listing')
    expect(listing).toBeTruthy()
    expect(listing?.name).toBe('My Shop')
    expect(listing?.cell).toEqual({ x: 50, y: 50 })
    expect(listing?.status).toBe('verified')
    expect(listing?.network).toBe('eip155:8453')
    expect(listing?.price_usdc).toBe('0.1')
  })

  it('a cell listing is never re-probed by getMarketServices (owner controls when it re-probes, via PUT)', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, service_url, service_method, probe_status, block_id, block_origin_x, block_origin_y)
       VALUES (5151, 51, 51, '0xSeller2', 'https://another-shop.example.com/api', 'GET', 'candidate', 'blk_51_51_1x1', 51, 51)`
    )
    probeHolder.fn.mockClear()
    await getMarketServices({})
    expect(probeHolder.fn).not.toHaveBeenCalledWith('https://another-shop.example.com/api', expect.anything())
  })
})
