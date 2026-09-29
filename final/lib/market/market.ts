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
import { findAllSupportedUsdcAccepts, formatUsdcAmount, type X402Accept } from './x402'
import { normalizeStoredEvidence, computeStatusByNetwork } from './evidence'
import type { MarketEntry, MarketEvidence, MarketNetworkOffer, MarketSellerGroup, MarketStatus, SeedEntry } from './types'
// @ts-ignore -- resolveJsonModule; seed.json is a flat array, see lib/market/seed.json's own provenance notes per entry.
import seedData from './seed.json'

const STALE_MS = 30 * 60 * 1000
const STATUS_ORDER: Record<MarketStatus, number> = { verified: 0, candidate: 1, unprobed: 2, failed: 3 }
/** Plain-language labels for the status_label field below — same two networks as lib/market/x402.ts NETWORK_PRIORITY. */
const NETWORK_LABEL_ZH: Record<string, string> = { 'eip155:143': 'Monad', 'eip155:8453': 'Base' }
const STATUS_LABEL_ZH: Record<MarketStatus, string> = { verified: '已验证', candidate: '候选', failed: '失败', unprobed: '未探测' }

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
    `INSERT INTO market_services (url, name, method, description, category, origin, network, price_usdc, pay_to, status, probe_accepts, evidence, evidence_by_network, note, probed_at, updated_at)
     VALUES ($1,$2,$3,NULL,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (url) DO UPDATE SET
       name = EXCLUDED.name, method = EXCLUDED.method, origin = EXCLUDED.origin,
       network = EXCLUDED.network, price_usdc = EXCLUDED.price_usdc, pay_to = EXCLUDED.pay_to,
       status = EXCLUDED.status, probe_accepts = EXCLUDED.probe_accepts, evidence = EXCLUDED.evidence,
       evidence_by_network = EXCLUDED.evidence_by_network,
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
      result.evidence_by_network ? JSON.stringify(result.evidence_by_network) : null,
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

/**
 * "同一个卖家"的分组 key：优先用「哪条网络 + 那条网络上的收款地址」（同一个
 * payTo 在同一条链上出现在多个接口下 = 同一个卖家共享一份证据，见
 * groupSellers() 和文件顶部对 agent402 15 个工具共用 0xaBF4FAbd… 的说明）；
 * 没有 payTo 时退回 origin 主机（同一个网站下的接口至少大概率是同一方）。
 */
function computeSellerId(network: string | null, payTo: string | null, url: string): string {
  if (network && payTo) return `${network}:${payTo.toLowerCase()}`
  try {
    return `origin:${new URL(url).host}`
  } catch {
    return `origin:${url}`
  }
}

/** evidence_by_network 列的 JSONB -> Record<network, MarketEvidence>，逐条走 normalizeStoredEvidence。 */
function evidenceByNetworkFromRow(raw: unknown): Record<string, MarketEvidence> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, MarketEvidence> = {}
  for (const [network, v] of Object.entries(raw as Record<string, unknown>)) {
    const ev = normalizeStoredEvidence(v, network)
    if (ev) out[network] = ev
  }
  return Object.keys(out).length > 0 ? out : null
}

function mapOfficialRow(r: any): MarketEntry {
  const evidence = normalizeStoredEvidence(r.evidence, r.network ?? null)
  const evidence_by_network = evidenceByNetworkFromRow(r.evidence_by_network)
  const networks = networksFromAccepts(r.probe_accepts)
  return {
    name: r.name,
    url: r.url,
    method: r.method,
    description: r.description,
    category: r.category,
    network: r.network,
    price_usdc: r.price_usdc,
    pay_to: r.pay_to,
    networks,
    status: (r.status as MarketStatus) ?? 'unprobed',
    status_by_network: computeStatusByNetwork(networks, evidence_by_network),
    evidence,
    evidence_by_network,
    status_label: null,
    source: 'official',
    origin: r.origin,
    cell: null,
    probed_at: r.probed_at,
    note: r.note ?? '',
    seller_id: computeSellerId(r.network ?? null, r.pay_to ?? null, r.url),
  }
}

function mapListingRow(r: any): MarketEntry {
  // probe_accepts is the raw, unfiltered 402 accepts array — pick the
  // Monad-priority primary via findAllSupportedUsdcAccepts rather than
  // blindly trusting accepts[0] (which could be any network the origin
  // server happened to list first, supported or not).
  const networks = networksFromAccepts(r.probe_accepts)
  const primary = networks?.[0] ?? null
  const evidence = normalizeStoredEvidence(r.evidence, primary?.network ?? null)
  const evidence_by_network = evidenceByNetworkFromRow(r.evidence_by_network)
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
    status: (r.probe_status as MarketStatus) ?? 'unprobed',
    status_by_network: computeStatusByNetwork(networks, evidence_by_network),
    evidence,
    evidence_by_network,
    status_label: null,
    source: 'listing',
    origin: null,
    cell: { x: r.x, y: r.y },
    probed_at: r.probed_at,
    note: '',
    seller_id: computeSellerId(primary?.network ?? null, primary?.payTo ?? null, r.service_url),
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
 * 按所筛网络重算一条 entry 的「主状态」（`status` 字段，向后兼容字段，之前一直
 * 是"任一网络最好的那条"）。2026-09-30 诚实标注修复：filters.network 存在时，
 * 这个字段必须只反映**那一条网络自己**的证据，不能再让 Base 的付款证据在
 * Monad 视图里显示成 VERIFIED（见文件头 groupSellers/agent402 案例说明）。
 *
 * `status_by_network` 缺这个网络（没探测过/不支持）时原样返回，不瞎猜。
 * 网络自己的状态和整体最好状态不一致时，额外填一个人话 `status_label`（比如
 * "Monad 候选 · Base 已验证"），点出真正撑起 VERIFIED 的是哪条网络。
 */
function applyNetworkFocus(entry: MarketEntry, network: string): MarketEntry {
  const scopedStatus = entry.status_by_network?.[network]
  if (scopedStatus === undefined) return entry
  if (scopedStatus === entry.status) return { ...entry, status: scopedStatus }
  const betterNetworks = Object.entries(entry.status_by_network ?? {}).filter(
    ([net, s]) => net !== network && STATUS_ORDER[s] < STATUS_ORDER[scopedStatus]
  )
  const filteredLabel = NETWORK_LABEL_ZH[network] || network
  const label =
    betterNetworks.length > 0
      ? [
          `${filteredLabel} ${STATUS_LABEL_ZH[scopedStatus]}`,
          ...betterNetworks.map(([net, s]) => `${NETWORK_LABEL_ZH[net] || net} ${STATUS_LABEL_ZH[s]}`),
        ].join(' · ')
      : null
  return { ...entry, status: scopedStatus, status_label: label }
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
              probe_status, probe_accepts, probed_at, evidence, evidence_by_network
       FROM grid_cells WHERE service_url IS NOT NULL`
    ),
  ])

  let entries: MarketEntry[] = [
    ...officialRows.rows.map(mapOfficialRow),
    ...listingRows.rows.map(mapListingRow),
  ]

  // Network-scope the "main status" BEFORE filtering/sorting so a
  // status=verified filter combined with network=... filters on the
  // network-scoped status too, not the "best of any network" one.
  if (filters.network) {
    const network = filters.network
    entries = entries.map((e) => applyNetworkFocus(e, network))
  }

  entries = applyFilters(entries, filters)
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
  return entries
}

/**
 * 按 seller_id（收款方，见 MarketEntry.seller_id）把扁平列表分组——同一个卖家
 * 可能挂了好几个接口（agent402 的 15 个工具共用一个收款地址就是原型案例），
 * /market 页面按卖家分组展示，一组一张卡，展开看各个接口，避免「每个接口看起
 * 来都各自被验证过」的错觉。AI 消费方仍然拿 getMarketServices() 返回的扁平
 * `services` 数组，不受影响。
 *
 * 组的排序：按组内「所筛网络上的最强状态」（没筛网络就按整体最强状态）——
 * verified 组排最前，组内 service_count 多的排前面（同等状态下，接口更多的
 * 卖家更值得先看到）。
 */
export function groupSellers(entries: MarketEntry[], network?: string): MarketSellerGroup[] {
  const bySeller = new Map<string, MarketEntry[]>()
  for (const e of entries) {
    const list = bySeller.get(e.seller_id)
    if (list) list.push(e)
    else bySeller.set(e.seller_id, [e])
  }

  const groups: MarketSellerGroup[] = []
  // Array.from(...).entries()) rather than `for...of bySeller` directly —
  // this tsconfig has no `target` set (defaults to ES3 for plain `tsc`),
  // which can't iterate a Map without --downlevelIteration.
  for (const [seller_id, services] of Array.from(bySeller.entries())) {
    const statusOf = (e: MarketEntry): MarketStatus => (network && e.status_by_network?.[network]) || e.status
    const bestStatus = services.reduce<MarketStatus>((best, e) => {
      const s = statusOf(e)
      return STATUS_ORDER[s] < STATUS_ORDER[best] ? s : best
    }, 'unprobed')
    const rep = services[0]
    let origin_host: string | null = null
    try {
      origin_host = new URL(rep.url).host
    } catch {
      origin_host = null
    }
    groups.push({
      seller_id,
      network: rep.network,
      pay_to: rep.pay_to,
      origin_host,
      service_count: services.length,
      status: bestStatus,
      services,
    })
  }

  groups.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.service_count - a.service_count)
  return groups
}
