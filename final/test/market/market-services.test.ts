import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'
import { BASE_USDC_ADDRESS, MONAD_USDC_ADDRESS } from '../../lib/market/x402'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../../lib/db', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

// No real network: the probe layer is driven entirely by this fixture so
// official-candidate probing (seed.json, 13 entries) is deterministic and
// offline. The probe's own LOGIC is covered by test/market/x402-probe.test.ts —
// this file is about getMarketServices()'s aggregation/cache/filter/sort behavior.
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

const NOW = new Date().toISOString()

function fixtureProbe(url: string, method: string) {
  if (method !== 'GET') {
    return { status: 'unchecked', accepts: null, network: null, price_usdc: null, pay_to: null, probed_at: null, note: '' }
  }
  if (url.includes('monad-lingqian') || url.includes('nansen.ai')) {
    return {
      status: 'can_pay',
      accepts: [{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xSeedPay' }],
      network: 'eip155:143',
      price_usdc: '0.01',
      pay_to: '0xSeedPay',
      probed_at: NOW,
      note: '',
    }
  }
  return { status: 'failed', accepts: null, network: null, price_usdc: null, pay_to: null, probed_at: NOW, note: 'no match' }
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
    // seed.json has 13 entries (see lib/market/seed.json); nothing else is crawled.
    const official = entries.filter((e) => e.source === 'official')
    expect(official.length).toBe(13)
    expect(official.every((e) => e.origin === 'seed')).toBe(true)
    expect(probeHolder.fn).toHaveBeenCalledTimes(13)
  })

  it('every status is one of can_pay / failed / unchecked, sorted in that order of usefulness (can_pay, unchecked, failed)', async () => {
    const entries = await getMarketServices({})
    expect(entries.every((e) => ['can_pay', 'failed', 'unchecked'].includes(e.status))).toBe(true)
    const statuses = entries.map((e) => e.status)
    expect(statuses.indexOf('can_pay')).toBe(0)
    expect(statuses.indexOf('can_pay')).toBeLessThan(statuses.indexOf('unchecked'))
    expect(statuses.indexOf('unchecked')).toBeLessThan(statuses.indexOf('failed'))
    // POST seeds are never probed
    const post = entries.filter((e) => e.method === 'POST')
    expect(post.length).toBeGreaterThan(0)
    for (const e of post) expect(e.status).toBe('unchecked')
  })

  it('entries carry no on-chain evidence fields and no seller grouping', async () => {
    const entries = await getMarketServices({})
    for (const e of entries) {
      const keys = Object.keys(e)
      for (const gone of ['evidence', 'evidence_by_network', 'status_by_network', 'status_label', 'seller_id']) expect(keys).not.toContain(gone)
    }
  })

  it('stores the official status in the old column vocabulary (can_pay -> candidate, unchecked -> unprobed)', async () => {
    await getMarketServices({})
    const rows = await testDb.dbQuery(`SELECT status, COUNT(*)::int AS n FROM market_services GROUP BY status`)
    const byStatus = Object.fromEntries(rows.rows.map((r: any) => [r.status, r.n]))
    expect(byStatus.candidate).toBe(2)
    expect(byStatus.unprobed).toBeGreaterThan(0)
    expect(Object.keys(byStatus).every((s) => ['candidate', 'failed', 'unprobed'].includes(s))).toBe(true)
  })

  it('does not write evidence columns when it caches an official probe', async () => {
    await getMarketServices({})
    const rows = await testDb.dbQuery(`SELECT COUNT(*)::int AS n FROM market_services WHERE evidence IS NOT NULL OR evidence_by_network IS NOT NULL`)
    expect(rows.rows[0].n).toBe(0)
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

  it('rows an earlier version cached from the Bazaar sync (origin = bazaar) or from a seed entry since removed are not shown', async () => {
    await getMarketServices({})
    await testDb.dbQuery(
      `INSERT INTO market_services (url, name, method, origin, network, price_usdc, status, probed_at)
       VALUES ('https://bazaar-only.example.com/x', 'Bazaar only', 'GET', 'bazaar', 'eip155:8453', '0.01', 'verified', NOW())`
    )
    const entries = await getMarketServices({})
    expect(entries.find((e) => e.url === 'https://bazaar-only.example.com/x')).toBeUndefined()
    expect(entries.filter((e) => e.source === 'official').length).toBe(13)
  })
})

describe('lib/market/market getMarketServices — filters', () => {
  it('filters by status=can_pay', async () => {
    const entries = await getMarketServices({ status: 'can_pay' })
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(e.status).toBe('can_pay')
    expect(entries.some((e) => e.name === 'Monad 灵签')).toBe(true)
  })

  it('the old status words match nothing (the contract is can_pay / failed / unchecked)', async () => {
    for (const old of ['verified', 'candidate', 'unprobed']) {
      expect(await getMarketServices({ status: old })).toEqual([])
    }
  })

  it('filters by network=eip155:143', async () => {
    const entries = await getMarketServices({ network: 'eip155:143' })
    expect(entries.length).toBeGreaterThan(0)
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
  const BASE_ACCEPTS = [{ scheme: 'exact', network: 'eip155:8453', amount: '100000', asset: BASE_USDC_ADDRESS, payTo: '0xSeller' }]

  it('includes a grid_cells service listing alongside official entries', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, service_desc, service_category, probe_status, probe_accepts, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES (5050, 50, 50, '0xSeller', 'My Shop', 'https://myshop.example.com/api', 'GET', 'demo listing', 'data', 'candidate',
               $1, NOW(), 'blk_50_50_1x1', 50, 50)`,
      [JSON.stringify(BASE_ACCEPTS)]
    )
    const entries = await getMarketServices({})
    const listing = entries.find((e) => e.source === 'listing')
    expect(listing).toBeTruthy()
    expect(listing?.name).toBe('My Shop')
    expect(listing?.cell).toEqual({ x: 50, y: 50 })
    expect(listing?.status).toBe('can_pay')
    expect(listing?.network).toBe('eip155:8453')
    expect(listing?.price_usdc).toBe('0.1')
    expect(listing?.networks).toEqual([{ network: 'eip155:8453', price_usdc: '0.1', payTo: '0xSeller', asset: BASE_USDC_ADDRESS }])
  })

  it('a row the old code stored as verified (with evidence JSON still in the columns) reads as plain can_pay and the evidence is ignored', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, probe_accepts, evidence, evidence_by_network, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES (6666, 66, 66, '0xOldRow', 'legacy listing', 'https://legacy.example.com/api', 'GET', 'verified', $1, $2, $3, NOW(), 'blk_66_66_1x1', 66, 66)`,
      [
        JSON.stringify([{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xLegacyPay' }]),
        JSON.stringify({ payers_7d: 3, transfers_7d: 5, last_tx: '0xold', last_at: NOW, source: 'rpc-short-window', window_blocks: 600 }),
        JSON.stringify({ 'eip155:143': { network: 'eip155:143', payers: 3, transfers: 5, last_tx: '0xold', last_at: NOW, source: 'rpc-short-window', window: { blocks: 600, human: '约 3 分钟' } } }),
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
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, service_url, service_method, probe_status, block_id, block_origin_x, block_origin_y) VALUES
         (5151, 51, 51, '0xS', 'https://failed-shop.example.com/api', 'GET', 'failed', 'blk_51_51_1x1', 51, 51),
         (5252, 52, 52, '0xS', 'https://post-shop.example.com/api', 'POST', 'unprobed', 'blk_52_52_1x1', 52, 52)`
    )
    const entries = await getMarketServices({})
    expect(entries.find((e) => e.url === 'https://failed-shop.example.com/api')?.status).toBe('failed')
    expect(entries.find((e) => e.url === 'https://post-shop.example.com/api')?.status).toBe('unchecked')
  })

  it('a cell listing is never re-probed by getMarketServices (owner controls when it re-probes, via PUT)', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, service_url, service_method, probe_status, block_id, block_origin_x, block_origin_y)
       VALUES (5353, 53, 53, '0xSeller2', 'https://another-shop.example.com/api', 'GET', 'candidate', 'blk_53_53_1x1', 53, 53)`
    )
    probeHolder.fn.mockClear()
    await getMarketServices({})
    expect(probeHolder.fn).not.toHaveBeenCalledWith('https://another-shop.example.com/api', expect.anything())
  })
})
