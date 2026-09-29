/**
 * Coinbase Bazaar 只读发现接口：GET /platform/v2/x402/discovery/search
 * （公开、无需 key）。按 network=eip155:143 + 若干关键词查询，合并去重。
 *
 * 照抄改写自 C:\1mineyswitch\repos\lantern-city\service\src\bazaar.ts（不跨
 * 仓库 import）。仍然只查 Monad（network=eip155:143）——MONAD-MARKET-SPEC.md
 * P3 明确写的是「再加上 Coinbase Bazaar 里 network=eip155:143 的同步结果」，
 * 没有要求同步 Base 的 Bazaar 结果，所以这里不推广到 Base。
 */
import { MONAD_NETWORK, MONAD_USDC_ADDRESS, normalizeAccepts } from './x402'

export const BAZAAR_SEARCH_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/search'

export const DEFAULT_BAZAAR_KEYWORDS = ['usdc', 'balance', 'agent', 'data', 'price', 'monad']

export interface BazaarResource {
  name: string
  url: string
  method: string
  note: string
}

interface RawBazaarSearchResponse {
  resources?: unknown[]
}

function extractOne(raw: unknown, keyword: string): BazaarResource | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const resourceUrl = typeof r.resource === 'string' ? r.resource : null
  if (!resourceUrl) return null
  const accepts = normalizeAccepts(r.accepts)
  const hasMonadUsdc = accepts.some(
    (a) => a.network === MONAD_NETWORK && typeof a.asset === 'string' && a.asset.toLowerCase() === MONAD_USDC_ADDRESS.toLowerCase()
  )
  if (!hasMonadUsdc) return null
  const extensions = r.extensions as Record<string, unknown> | undefined
  const bazaarExt = extensions?.bazaar as Record<string, unknown> | undefined
  const info = bazaarExt?.info as Record<string, unknown> | undefined
  const input = info?.input as Record<string, unknown> | undefined
  const method = typeof input?.method === 'string' ? input.method : 'GET'
  const name = typeof r.serviceName === 'string' && r.serviceName.trim() ? r.serviceName.trim() : resourceUrl
  return {
    name,
    url: resourceUrl,
    method,
    note: `来源：Coinbase Bazaar 公开发现接口（/discovery/search?network=eip155:143&query=${keyword}）。`,
  }
}

export function originPathKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export function dedupeByOriginPath<T extends { url: string }>(items: T[]): T[] {
  const seen = new Map<string, T>()
  for (const item of items) {
    const key = originPathKey(item.url)
    if (!seen.has(key)) seen.set(key, item)
  }
  return Array.from(seen.values())
}

export interface FetchBazaarOptions {
  keywords?: string[]
  limit?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** 对每个关键词各发一次 GET，合并全部结果后按 origin+pathname 去重。任何一个关键词失败都不影响其它关键词。 */
export async function fetchBazaarResources(opts: FetchBazaarOptions = {}): Promise<BazaarResource[]> {
  const keywords = opts.keywords ?? DEFAULT_BAZAAR_KEYWORDS
  const limit = Math.min(opts.limit ?? 20, 20)
  const timeoutMs = opts.timeoutMs ?? 10_000
  const fetchImpl = opts.fetchImpl ?? fetch

  const all: BazaarResource[] = []
  for (const keyword of keywords) {
    const url = `${BAZAAR_SEARCH_URL}?network=${encodeURIComponent(MONAD_NETWORK)}&query=${encodeURIComponent(keyword)}&limit=${limit}`
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetchImpl(url, { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) continue
      const body = (await res.json()) as RawBazaarSearchResponse
      const resources = Array.isArray(body.resources) ? body.resources : []
      for (const raw of resources) {
        const item = extractOne(raw, keyword)
        if (item) all.push(item)
      }
    } catch {
      continue
    }
  }
  return dedupeByOriginPath(all)
}
