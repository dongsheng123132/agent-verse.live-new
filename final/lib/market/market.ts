/**
 * 文字版服务索引：合并「官方收录」（curated seed.json，探测结果缓存进
 * market_services 表，超过 30 分钟就后台刷新，不阻塞响应）和「格子挂牌」
 * （grid_cells 里所有填了 service_url 的格子，探测结果就存在 grid_cells 自己身上，
 * 由 PUT /api/cells/update 在保存时刷新，这里只读不重新探测）。
 * GET /api/services 和 /market 页面都走这里。
 *
 * 状态只来自只读 402 探测（can_pay / failed / unchecked，见 types.ts）：不再查链
 * 上付款证据，也不再自动抓 Coinbase Bazaar。
 */
import { dbQuery } from '../db'
import { ensureSchema } from '../schema'
import { probeService } from './service'
import { findAllSupportedUsdcAccepts, formatUsdcAmount, type X402Accept } from './x402'
import { fromStoredStatus, toStoredStatus } from './types'
import type { MarketEntry, MarketNetworkOffer, MarketStatus, SeedEntry } from './types'
// @ts-ignore -- resolveJsonModule; seed.json is a flat array, see lib/market/seed.json's own provenance notes per entry.
import seedData from './seed.json'

const STALE_MS = 30 * 60 * 1000
const STATUS_ORDER: Record<MarketStatus, number> = { can_pay: 0, unchecked: 1, failed: 2 }

function seedEntries(): SeedEntry[] {
  return seedData as SeedEntry[]
}

async function probeAndUpsert(candidate: SeedEntry): Promise<void> {
  const result = await probeService(candidate.url, candidate.method)
  await dbQuery(
    `INSERT INTO market_services (url, name, method, description, category, origin, network, price_usdc, pay_to, status, probe_accepts, note, probed_at, updated_at)
     VALUES ($1,$2,$3,NULL,NULL,'seed',$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (url) DO UPDATE SET
       name = EXCLUDED.name, method = EXCLUDED.method, origin = EXCLUDED.origin,
       network = EXCLUDED.network, price_usdc = EXCLUDED.price_usdc, pay_to = EXCLUDED.pay_to,
       status = EXCLUDED.status, probe_accepts = EXCLUDED.probe_accepts,
       note = EXCLUDED.note, probed_at = EXCLUDED.probed_at, updated_at = NOW()`,
    [
      candidate.url,
      candidate.name,
      candidate.method,
      result.network,
      result.price_usdc,
      result.pay_to,
      toStoredStatus(result.status),
      result.accepts ? JSON.stringify(result.accepts) : null,
      [candidate.note, result.note].filter(Boolean).join(' '),
      // POST-method / never-fetched candidates come back with probed_at=null
      // (probe.ts never made a request) — stamp our own timestamp anyway so
      // the 30-minute staleness cache still applies to them. Without this, a
      // POST entry (permanently 'unchecked') would look "never cached" forever
      // and get re-probed (i.e. re-considered for the background refresh) on
      // every single request instead of once per 30 minutes.
      result.probed_at ?? new Date().toISOString(),
    ]
  )
}

/**
 * Re-probes the curated seed entries. `onlyStale=true` (the normal background-refresh
 * path) only touches rows missing from market_services or older than 30
 * minutes; `onlyStale=false` (cold start, market_services is empty) probes
 * everything synchronously once.
 */
export async function refreshOfficialServices(opts: { onlyStale?: boolean } = {}): Promise<{ probed: number; failed: number }> {
  await ensureSchema()
  const candidates = seedEntries()
  let toProbe = candidates
  if (opts.onlyStale) {
    const existing = await dbQuery(`SELECT url, probed_at FROM market_services`)
    const probedAtByUrl = new Map<string, string | null>(existing.rows.map((r: any) => [r.url, r.probed_at]))
    const now = Date.now()
    toProbe = candidates.filter((c) => {
      const probedAt = probedAtByUrl.get(c.url)
      if (probedAt === undefined) return true // never cached
      if (!probedAt) return true
      return now - new Date(probedAt).getTime() > STALE_MS
    })
  }
  let probed = 0
  let failed = 0
  for (const candidate of toProbe) {
    try {
      await probeAndUpsert(candidate)
      probed++
    } catch (err) {
      failed++
      console.error('[lib/market/market] probe failed for', candidate.url, (err as Error)?.message)
    }
  }
  return { probed, failed }
}

/**
 * Every supported network's price/payTo/asset (Monad first) derived straight
 * from a row's raw `probe_accepts` — no separate DB column needed since
 * probe_accepts already stores the full, unfiltered accepts array (see
 * lib/market/service.ts / app/api/cells/update/route.js, both of which store
 * `result.accepts` verbatim).
 */
function networksFromAccepts(accepts: unknown): MarketNetworkOffer[] | null {
  if (!Array.isArray(accepts)) return null
  const matches = findAllSupportedUsdcAccepts(accepts as X402Accept[])
  if (matches.length === 0) return null
  return matches.map((a) => ({ network: a.network, price_usdc: formatUsdcAmount(a.amount), payTo: a.payTo, asset: a.asset }))
}

function mapOfficialRow(r: any): MarketEntry {
  return {
    name: r.name,
    url: r.url,
    method: r.method,
    description: r.description,
    category: r.category,
    network: r.network,
    price_usdc: r.price_usdc,
    pay_to: r.pay_to,
    networks: networksFromAccepts(r.probe_accepts),
    status: fromStoredStatus(r.status),
    source: 'official',
    origin: 'seed',
    cell: null,
    probed_at: r.probed_at,
    note: r.note ?? '',
  }
}

function mapListingRow(r: any): MarketEntry {
  // probe_accepts is the raw, unfiltered 402 accepts array — pick the
  // Monad-priority primary via findAllSupportedUsdcAccepts rather than
  // blindly trusting accepts[0] (which could be any network the origin
  // server happened to list first, supported or not).
  const networks = networksFromAccepts(r.probe_accepts)
  const primary = networks?.[0] ?? null
  return {
    name: r.title || `Cell (${r.x},${r.y})`,
    url: r.service_url,
    method: r.service_method || 'GET',
    description: r.service_desc,
    category: r.service_category,
    network: primary?.network ?? null,
    price_usdc: primary?.price_usdc ?? null,
    pay_to: primary?.payTo ?? null,
    networks,
    status: fromStoredStatus(r.probe_status),
    source: 'listing',
    origin: null,
    cell: { x: r.x, y: r.y },
    probed_at: r.probed_at,
    note: '',
  }
}

export interface MarketFilters {
  q?: string
  network?: string
  max_price?: number
  category?: string
  status?: string
}

function applyFilters(entries: MarketEntry[], filters: MarketFilters): MarketEntry[] {
  let out = entries
  if (filters.q) {
    const q = filters.q.toLowerCase()
    out = out.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q)
    )
  }
  if (filters.network) {
    // Match either the primary network field or any of the service's
    // supported networks (a service accepting both Base and Monad USDC
    // should show up when filtering by either).
    out = out.filter((e) => e.network === filters.network || (e.networks ?? []).some((n) => n.network === filters.network))
  }
  if (filters.max_price !== undefined && Number.isFinite(filters.max_price)) {
    out = out.filter((e) => e.price_usdc !== null && Number(e.price_usdc) <= (filters.max_price as number))
  }
  if (filters.category) {
    const c = filters.category.toLowerCase()
    out = out.filter((e) => (e.category || '').toLowerCase() === c)
  }
  if (filters.status) {
    out = out.filter((e) => e.status === filters.status)
  }
  return out
}

/**
 * Main entry point for GET /api/services and /market. Cold start (empty
 * market_services) probes the seed entries synchronously once; afterwards
 * only stale (>30min) rows are refreshed, in the background, without
 * blocking this call.
 */
export async function getMarketServices(filters: MarketFilters = {}): Promise<MarketEntry[]> {
  await ensureSchema()
  const countRes = await dbQuery(`SELECT COUNT(*)::int AS n FROM market_services`)
  const isEmpty = (countRes.rows[0]?.n ?? 0) === 0
  if (isEmpty) {
    await refreshOfficialServices({ onlyStale: false })
  } else {
    // Fire-and-forget: does not block this request.
    refreshOfficialServices({ onlyStale: true }).catch((err) =>
      console.error('[lib/market/market] background refresh failed:', err?.message)
    )
  }

  const [officialRows, listingRows] = await Promise.all([
    dbQuery(`SELECT * FROM market_services ORDER BY name`),
    dbQuery(
      `SELECT x, y, title, service_url, service_method, service_desc, service_category,
              probe_status, probe_accepts, probed_at
       FROM grid_cells WHERE service_url IS NOT NULL`
    ),
  ])

  // Only the curated seed entries are "official". Rows an earlier version
  // cached from the Coinbase Bazaar sync (origin = 'bazaar') are no longer
  // refreshed, so they must not show up either.
  const seedUrls = new Set(seedEntries().map((s) => s.url))
  let entries: MarketEntry[] = [
    ...officialRows.rows.filter((r: any) => seedUrls.has(r.url)).map(mapOfficialRow),
    ...listingRows.rows.map(mapListingRow),
  ]

  entries = applyFilters(entries, filters)
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
  return entries
}
