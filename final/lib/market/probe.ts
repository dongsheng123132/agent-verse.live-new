/**
 * 只读 402 探测：对 method=GET 的条目发 GET（不带付款、不带任何签名头），
 * 解析响应，判断是否 can_pay（返回了合法的 x402 v2 402，且 accepts 里有 Monad 或
 * Base 的 USDC）。绝不发起付款，绝不对非 GET 条目发请求（POST/PUT 等一律跳过，
 * 标 unchecked）。
 *
 * 改写自 C:\1mineyswitch\repos\lantern-city\service\src\probe.ts（不跨仓库
 * import）。区别：
 *  - 发请求前先过 lib/market/ssrf.ts 的 SSRF 检查（拒绝私网/环回/链路本地/
 *    元数据地址，解析 DNS 后检查）——原版没有这一步，因为 lantern-city 只探测
 *    自己 seed.json 里手工维护的地址；这里的地址是格子主人自己填的，必须防
 *    SSRF（MONAD-MARKET-SPEC.md P2）。
 *  - `findMonadUsdcAccept` 换成 `findSupportedUsdcAccept`（Base 或 Monad 都算）。
 *  - 2026-09-29：新增 `networks` 字段——一个服务可能两条链都能付，`network`/
 *    `price_usdc`/`payTo`/`asset` 只是其中的「主显示网络」（Monad 优先），
 *    `networks` 把 accepts 里每个受支持网络各一条的报价都保留下来。
 */
import { findAllSupportedUsdcAccepts, formatUsdcAmount, parseX402Response, type X402Accept } from './x402'
import { assertPublicHttpsUrl } from './ssrf'
import type { MarketStatus } from './types'

export interface ProbeTarget {
  url: string
  method: string
}

/** 一个受支持网络的报价（見 findAllSupportedUsdcAccepts）。 */
export interface ProbeNetworkResult {
  network: string
  price_usdc: string | null
  payTo: string | null
  asset: string | null
}

export interface ProbeResult {
  /** 'failed' 覆盖了 ssrf/网络错误/非 402/x402 v1/无匹配 accept 等所有失败情况；'unchecked' = 非 GET，没探测。 */
  status: MarketStatus
  /** 主显示网络（networks[0]，Monad 优先）的价格/网络/资产/收款地址——向后兼容旧的单网络字段。 */
  price_usdc: string | null
  network: string | null
  asset: string | null
  payTo: string | null
  /** accepts 中本市场支持的所有网络各一条报价，按 Monad 优先排序；只有 can_pay 时非 null。 */
  networks: ProbeNetworkResult[] | null
  accepts: X402Accept[] | null
  probedAt: string | null
  note: string
}

export interface ProbeOptions {
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function unchecked(note: string, probedAt: string | null = null): ProbeResult {
  return { status: 'unchecked', price_usdc: null, network: null, asset: null, payTo: null, networks: null, accepts: null, probedAt, note }
}

function failed(note: string, probedAt: string | null): ProbeResult {
  return { status: 'failed', price_usdc: null, network: null, asset: null, payTo: null, networks: null, accepts: null, probedAt, note }
}

/** 探测单个 GET 目标。调用方负责先过滤掉非 GET 的条目——这个函数本身不检查 method，直接发 GET。 */
export async function probeGetTarget(url: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const fetchImpl = opts.fetchImpl ?? fetch
  const probedAt = new Date().toISOString()

  const ssrf = await assertPublicHttpsUrl(url)
  if (!ssrf.ok) {
    return failed(`SSRF 检查未通过：${ssrf.reason}`, probedAt)
  }

  let res: Response
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      res = await fetchImpl(url, { method: 'GET', signal: controller.signal, redirect: 'follow' })
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return failed(`探测失败（网络错误或超时 ${timeoutMs}ms）：${msg}`, probedAt)
  }

  if (res.status !== 402) {
    await res.arrayBuffer().catch(() => undefined)
    return failed(`GET 未返回 402（实际 status=${res.status}）`, probedAt)
  }

  const headerValue = res.headers.get('payment-required')
  const bodyText = await res.text().catch(() => '')
  const parsed = parseX402Response(headerValue, bodyText)
  if (!parsed) {
    return failed('402 响应无法解析（既不是合法的 PAYMENT-REQUIRED 头，也不是合法的 x402 JSON body）', probedAt)
  }
  // The index says "can pay" only for x402 v2 (what AgentVerse's own buyers speak); a v1 402 is a different protocol.
  if (parsed.x402Version !== 2) {
    return failed(`402 响应是 x402 v${parsed.x402Version}，不是 v2`, probedAt)
  }

  const matches = findAllSupportedUsdcAccepts(parsed.accepts)
  if (matches.length === 0) {
    const seenNetworks = parsed.accepts.map((a) => a.network).join(', ') || '(空)'
    return failed(`402 accepts 里没有 eip155:143/8453（或测试网 eip155:10143/84532）+ 对应链 USDC 的组合（accepts 的 network 有：${seenNetworks}）`, probedAt)
  }

  const networks: ProbeNetworkResult[] = matches.map((a) => ({
    network: a.network,
    price_usdc: formatUsdcAmount(a.amount),
    payTo: a.payTo,
    asset: a.asset,
  }))
  const primary = networks[0]

  return {
    status: 'can_pay',
    price_usdc: primary.price_usdc,
    network: primary.network,
    asset: primary.asset,
    payTo: primary.payTo,
    networks,
    accepts: parsed.accepts,
    probedAt,
    note: `探测到 x402 v2 的 402，accepts 命中 ${networks.map((n) => n.network).join(' + ')} + USDC（主网络 ${primary.network}）。`,
  }
}

/** 探测单个格子服务：method !== 'GET' 直接标 unchecked（绝不对 POST 服务发请求）。 */
export async function probeCellService(target: ProbeTarget, opts: ProbeOptions = {}): Promise<ProbeResult> {
  if (target.method !== 'GET') {
    return unchecked(`非 GET 方法（${target.method}），按规则不探测，绝不发起付款或 POST`)
  }
  return probeGetTarget(target.url, opts)
}
