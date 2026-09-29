import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'
import { BASE_USDC_ADDRESS, MONAD_USDC_ADDRESS } from '../../lib/market/x402'

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

const { getMarketServices, groupSellers } = await import('../../lib/market/market')
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
        // asset must be the real Base USDC contract address — networksFromAccepts()
        // (see lib/market/market.ts) now validates it, not just accepts[0] blindly.
        JSON.stringify([{ scheme: 'exact', network: 'eip155:8453', amount: '100000', asset: BASE_USDC_ADDRESS, payTo: '0xSeller' }]),
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
    expect(listing?.networks).toEqual([{ network: 'eip155:8453', price_usdc: '0.1', payTo: '0xSeller', asset: BASE_USDC_ADDRESS }])
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

/**
 * 2026-09-30 诚实标注修复（原型案例：agent402 的 15 个工具共用一个收款地址，
 * Base 链上有真付款证据，Monad 没有）。用两条格子挂牌行模拟"共用同一个
 * payTo"的两个接口——挂牌行不会被 getMarketServices() 重新探测（上面那条测试
 * 已经证明），所以可以直接摆好 evidence/evidence_by_network 断言读取逻辑，不
 * 用管 probe 层。
 */
describe('lib/market/market getMarketServices — 2026-09-30 honesty fix (network-scoped status, evidence_by_network, seller grouping)', () => {
  const AGENT402_ACCEPTS = [
    { scheme: 'exact', network: 'eip155:143', amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xaBF4FAbd000000000000000000000000000000' },
    { scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: BASE_USDC_ADDRESS, payTo: '0xaBF4FAbd000000000000000000000000000000' },
  ]
  // 顶层 evidence（"最好的那条"，向后兼容字段）镜像 Base——8 个付款人，
  // 86 笔转账，真实存在于 Base 主网（见任务描述里核实过的 last_tx）。
  const BASE_EVIDENCE = {
    network: 'eip155:8453',
    payers: 8,
    transfers: 86,
    last_tx: '0x985c4a',
    last_at: NOW,
    source: 'rpc-short-window',
    window: { blocks: 12006, human: '约 6.7 小时' },
    payers_7d: 8,
    transfers_7d: 86,
    window_blocks: 12006,
  }
  const EVIDENCE_BY_NETWORK = {
    'eip155:143': {
      network: 'eip155:143',
      payers: 0,
      transfers: 0,
      last_tx: null,
      last_at: null,
      source: 'rpc-short-window',
      window: { blocks: 606, human: '约 3 分钟' },
      payers_7d: 0,
      transfers_7d: 0,
      window_blocks: 606,
    },
    'eip155:8453': BASE_EVIDENCE,
  }

  async function insertAgent402Listing(id: number, x: number, y: number, name: string) {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, probe_accepts, evidence, evidence_by_network, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES ($1, $2, $3, '0xAgent402', $4, $5, 'GET', 'verified', $6, $7, $8, NOW(), $9, $2, $3)`,
      [
        id,
        x,
        y,
        name,
        `https://agent402.tools/api/${name}`,
        JSON.stringify(AGENT402_ACCEPTS),
        JSON.stringify(BASE_EVIDENCE),
        JSON.stringify(EVIDENCE_BY_NETWORK),
        `blk_${x}_${y}_1x1`,
      ]
    )
  }

  it('overall (unfiltered) status stays "verified" — Base evidence is real and backward compat must not regress it', async () => {
    await insertAgent402Listing(6060, 60, 60, 'uuid')
    const entries = await getMarketServices({})
    const entry = entries.find((e) => e.url === 'https://agent402.tools/api/uuid')
    expect(entry?.status).toBe('verified')
    expect(entry?.status_by_network).toEqual({ 'eip155:143': 'candidate', 'eip155:8453': 'verified' })
    expect(entry?.evidence_by_network?.['eip155:8453']?.payers).toBe(8)
    expect(entry?.evidence_by_network?.['eip155:143']?.payers).toBe(0)
    expect(entry?.status_label).toBeNull() // no network filter applied -> no label
  })

  it('Base-only evidence does NOT count as verified in the Monad-filtered view (?network=eip155:143)', async () => {
    await insertAgent402Listing(6161, 61, 61, 'quote')
    const entries = await getMarketServices({ network: 'eip155:143' })
    const entry = entries.find((e) => e.url === 'https://agent402.tools/api/quote')
    expect(entry).toBeTruthy()
    // The "main status" is now scoped to Monad — candidate, not verified.
    expect(entry?.status).toBe('candidate')
    // Explains itself: Monad is only candidate, Base is what's actually verified.
    expect(entry?.status_label).toContain('Monad')
    expect(entry?.status_label).toContain('候选')
    expect(entry?.status_label).toContain('Base')
    expect(entry?.status_label).toContain('已验证')
  })

  it('filtering by the network that DOES have real evidence (?network=eip155:8453) keeps status verified with no discrepancy label', async () => {
    await insertAgent402Listing(6262, 62, 62, 'weather')
    const entries = await getMarketServices({ network: 'eip155:8453' })
    const entry = entries.find((e) => e.url === 'https://agent402.tools/api/weather')
    expect(entry?.status).toBe('verified')
    expect(entry?.status_label).toBeNull()
  })

  it('combining status=verified with network=eip155:143 excludes a Base-only-verified entry (status filter runs on the network-scoped status)', async () => {
    await insertAgent402Listing(6363, 63, 63, 'ip-lookup')
    const scoped = await getMarketServices({ network: 'eip155:143', status: 'verified' })
    expect(scoped.some((e) => e.url === 'https://agent402.tools/api/ip-lookup')).toBe(false)
    const scopedCandidate = await getMarketServices({ network: 'eip155:143', status: 'candidate' })
    expect(scopedCandidate.some((e) => e.url === 'https://agent402.tools/api/ip-lookup')).toBe(true)
  })

  it('groupSellers() merges the shared-payTo interfaces into one seller group, network-scoped for sorting', async () => {
    await insertAgent402Listing(6464, 64, 64, 'tool-a')
    await insertAgent402Listing(6565, 65, 65, 'tool-b')
    const entries = await getMarketServices({})
    const group = groupSellers(entries).find((g) => g.pay_to === '0xaBF4FAbd000000000000000000000000000000')
    expect(group?.service_count).toBe(2)
    expect(group?.status).toBe('verified') // unfiltered: best-of-any is Base-verified

    const monadFocused = await getMarketServices({ network: 'eip155:143' })
    const monadGroup = groupSellers(monadFocused, 'eip155:143').find((g) => g.pay_to === '0xaBF4FAbd000000000000000000000000000000')
    expect(monadGroup?.status).toBe('candidate') // network-scoped: Monad alone is only candidate
  })

  it('field compatibility: a listing probed with the OLD evidence shape (no network/window/payers, no evidence_by_network) still reads back without crashing', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, probe_accepts, evidence, probed_at, block_id, block_origin_x, block_origin_y)
       VALUES (6666, 66, 66, '0xOldRow', 'legacy listing', 'https://legacy.example.com/api', 'GET', 'verified', $1, $2, NOW(), 'blk_66_66_1x1', 66, 66)`,
      [
        JSON.stringify([{ scheme: 'exact', network: 'eip155:143', amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xLegacyPay' }]),
        // OLD shape — exactly what pre-2026-09-30 code wrote: no `network`,
        // no `window`, no `payers`/`transfers`, no evidence_by_network row at all.
        JSON.stringify({ payers_7d: 3, transfers_7d: 5, last_tx: '0xold', last_at: NOW, source: 'rpc-short-window', window_blocks: 600 }),
      ]
    )
    const entries = await getMarketServices({})
    const entry = entries.find((e) => e.url === 'https://legacy.example.com/api')
    expect(entry?.evidence?.payers).toBe(3) // upgraded from the old payers_7d
    expect(entry?.evidence?.transfers).toBe(5)
    expect(entry?.evidence?.network).toBe('eip155:143') // fell back to the entry's own primary network
    expect(entry?.evidence?.window.human).toEqual(expect.any(String))
    expect(entry?.evidence_by_network).toBeNull() // never had a per-network breakdown

    // No per-network breakdown recorded for this legacy row — computeStatusByNetwork()
    // still runs off the supported networks list (from probe_accepts), it
    // just conservatively defaults to 'candidate' when it has no evidence to
    // back 'verified' for that specific network. This is intentional: a
    // pre-migration row's old aggregate 'verified' status never said WHICH
    // network earned it, so the Monad-scoped view must not blindly inherit
    // it (same honesty rule as the fresh agent402 case above) — it must not
    // crash either, and there's only one supported network here so no
    // "X candidate · Y verified" label applies.
    const scoped = await getMarketServices({ network: 'eip155:143' })
    const scopedEntry = scoped.find((e) => e.url === 'https://legacy.example.com/api')
    expect(scopedEntry?.status).toBe('candidate')
    expect(scopedEntry?.status_label).toBeNull()
  })
})
