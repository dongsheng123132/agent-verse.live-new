/**
 * P3 文字版市场聚合（MONAD-MARKET-SPEC.md）：合并「官方收录」（seed.json +
 * Coinbase Bazaar，缓存进 market_services 表，探测结果超过 30 分钟就后台刷新，
 * 不阻塞响应）和「格子挂牌」（grid_cells 里所有填了 service_url 的格子，探测
 * 结果就存在 grid_cells 自己身上，由 PUT /api/cells/update 在保存时刷新，这
 * 里只读不重新探测）。GET /api/services 和 /market 页面都走这里。
 */
import { dbQuery } from '../db.js'
import { ensureSchema } from '../schema'
import { fetchBazaarResources } from './bazaar'
import { dedupeByOriginPath, originPathKey } from './bazaar'
import { probeServiceAndEvidence } from './service'
import type { MarketEntry, MarketEvidence, MarketStatus, SeedEntry } from './types'
// @ts-ignore -- resolveJsonModule; seed.json is a flat array, see lib/market/seed.json's own provenance notes per entry.
import seedData from './seed.json'

const STALE_MS = 30 * 60 * 1000
const STATUS_ORDER: Record<MarketStatus, number> = { verified: 0, candidate: 1, unprobed: 2, failed: 3 }

interface OfficialCandidate {
  name: string
  url: string
  method: string
  origin: 'seed' | 'bazaar'
  note: string
}

async function buildOfficialCandidates(): Promise<OfficialCandidate[]> {
  const seed = seedData as SeedEntry[]
  let bazaar: Awaited<ReturnType<typeof fetchBazaarResources>> = []
  try {
    bazaar = await fetchBazaarResources()
  } catch (err) {
    console.error('[lib/market/market] fetchBazaarResources failed, continuing with seed only:', (err as Error)?.message)
  }
  const seedKeys = new Set(seed.map((s) => originPathKey(s.url)))
  const bazaarFiltered = dedupeByOriginPath(bazaar).filter((b) => !seedKeys.has(originPathKey(b.url)))
  return [
    ...seed.map((s): OfficialCandidate => ({ name: s.name, url: s.url, method: s.method, origin: 'seed', note: s.note })),
    ...bazaarFiltered.map((b): OfficialCandidate => ({ name: b.name, url: b.url, method: b.method, origin: 'bazaar', note: b.note })),
  ]
}

async function probeAndUpsert(candidate: OfficialCandidate): Promise<void> {
  const result = await probeServiceAndEvidence(candidate.url, candidate.method)
  await dbQuery(
    `INSERT INTO market_services (url, name, method, description, category, origin, network, price_usdc, pay_to, status, probe_accepts, evidence, note, probed_at, updated_at)
     VALUES ($1,$2,$3,NULL,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (url) DO UPDATE SET
       name = EXCLUDED.name, method = EXCLUDED.method, origin = EXCLUDED.origin,
       network = EXCLUDED.network, price_usdc = EXCLUDED.price_usdc, pay_to = EXCLUDED.pay_to,
       status = EXCLUDED.status, probe_accepts = EXCLUDED.probe_accepts, evidence = EXCLUDED.evidence,
       note = EXCLUDED.note, probed_at = EXCLUDED.probed_at, updated_at = NOW()`,
    [
      candidate.url,
      candidate.name,
      candidate.method,
      candidate.origin,
      result.network,
      result.price_usdc,
      result.pay_to,
      result.status,
      result.accepts ? JSON.stringify(result.accepts) : null,
      result.evidence ? JSON.stringify(result.evidence) : null,
      [candidate.note, result.note].filter(Boolean).join(' '),
      // POST-method / never-fetched candidates come back with probed_at=null
      // (probe.ts never made a request) — stamp our own timestamp anyway so
      // the 30-minute staleness cache still applies to them. Without this, a
      // POST entry (permanently 'unprobed') would look "never cached" forever
      // and get re-probed (i.e. re-considered for the background refresh) on
      // every single request instead of once per 30 minutes.
      result.probed_at ?? new Date().toISOString(),
    ]
  )
}

/**
 * Re-probes official candidates. `onlyStale=true` (the normal background-refresh
 * path) only touches rows missing from market_services or older than 30
 * minutes; `onlyStale=false` (cold start, market_services is empty) probes
 * everything synchronously once.
 */
export async function refreshOfficialServices(opts: { onlyStale?: boolean } = {}): Promise<{ probed: number; failed: number }> {
  await ensureSchema()
  const candidates = await buildOfficialCandidates()
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

function mapOfficialRow(r: any): MarketEntry {
  const evidence: MarketEvidence | null = r.evidence
    ? {
        payers_7d: r.evidence.payers_7d ?? 0,
        transfers_7d: r.evidence.transfers_7d ?? 0,
        last_tx: r.evidence.last_tx ?? null,
        last_at: r.evidence.last_at ?? null,
        source: r.evidence.source ?? 'rpc-short-window',
        window_blocks: r.evidence.window_blocks ?? 0,
      }
    : null
  return {
    name: r.name,
    url: r.url,
    method: r.method,
    description: r.description,
    category: r.category,
    network: r.network,
    price_usdc: r.price_usdc,
    pay_to: r.pay_to,
    status: (r.status as MarketStatus) ?? 'unprobed',
    evidence,
    source: 'official',
    origin: r.origin,
    cell: null,
    probed_at: r.probed_at,
    note: r.note ?? '',
  }
}

function mapListingRow(r: any): MarketEntry {
  const evidence: MarketEvidence | null = r.evidence
    ? {
        payers_7d: r.evidence.payers_7d ?? 0,
        transfers_7d: r.evidence.transfers_7d ?? 0,
        last_tx: r.evidence.last_tx ?? null,
        last_at: r.evidence.last_at ?? null,
        source: r.evidence.source ?? 'rpc-short-window',
        window_blocks: r.evidence.window_blocks ?? 0,
      }
    : null
  const accepts = Array.isArray(r.probe_accepts) ? r.probe_accepts : null
  const firstAccept = accepts && accepts[0]
  return {
    name: r.title || `Cell (${r.x},${r.y})`,
    url: r.service_url,
    method: r.service_method || 'GET',
    description: r.service_desc,
    category: r.service_category,
    network: firstAccept?.network ?? null,
    price_usdc: firstAccept ? formatFromAccept(firstAccept) : null,
    pay_to: firstAccept?.payTo ?? null,
    status: (r.probe_status as MarketStatus) ?? 'unprobed',
    evidence,
    source: 'listing',
    origin: null,
    cell: { x: r.x, y: r.y },
    probed_at: r.probed_at,
    note: '',
  }
}

function formatFromAccept(accept: any): string | null {
  // probe_accepts stores the raw X402Accept[]; amount is base units (6dp USDC).
  const amount = accept?.amount
  if (typeof amount !== 'string' || !/^\d+$/.test(amount)) return null
  const value = BigInt(amount)
  const million = BigInt(1_000_000)
  const whole = value / million
  const frac = (value % million).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
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
    out = out.filter((e) => e.network === filters.network)
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
 * market_services) probes official candidates synchronously once; afterwards
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
              probe_status, probe_accepts, probed_at, evidence
       FROM grid_cells WHERE service_url IS NOT NULL`
    ),
  ])

  let entries: MarketEntry[] = [
    ...officialRows.rows.map(mapOfficialRow),
    ...listingRows.rows.map(mapListingRow),
  ]

  entries = applyFilters(entries, filters)
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
  return entries
}
