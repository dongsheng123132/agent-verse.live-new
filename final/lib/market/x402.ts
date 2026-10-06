/**
 * 解析 402 响应：优先 x402 v2 的 `PAYMENT-REQUIRED` 响应头（base64 JSON），
 * 没有头就退回 v1 风格的响应体 JSON。只做只读解析，不发起任何付款。
 *
 * 改写自 C:\1mineyswitch\repos\lantern-city\service\src\x402.ts（不跨仓库
 * import）。与原版的区别：原版只认 Monad 一条链；这里同时认 Base
 * （eip155:8453）和 Monad（eip155:143），因为本仓库（MONAD-MARKET-SPEC.md
 * P2）的格子服务允许接受任意一条链的 USDC。BASE_USDC_ADDRESS 取自
 * @x402/evm 2.27.0 编译产物内置的默认资产表（node_modules/@x402/evm/dist/cjs/index.js
 * 里 `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`），MONAD_USDC_ADDRESS 与
 * lib/x402-flow.ts 的 MONAD_USDC_ADDRESS 保持同一个值。
 *
 * 2026-09-29 起：本市场是 Monad 优先市场——一个服务如果两条链都能付
 * （accepts 里同时有受支持的 Base 和 Monad USDC），主显示/主探测网络选 Monad，
 * 见 NETWORK_PRIORITY / findAllSupportedUsdcAccepts。
 */
import { BASE_NETWORK, MONAD_NETWORK, MONAD_USDC_ADDRESS, MONAD_TESTNET_NETWORK, MONAD_TESTNET_USDC_ADDRESS, BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS } from '../x402-flow'

export { BASE_NETWORK, MONAD_NETWORK }
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export { MONAD_USDC_ADDRESS }

/** network -> USDC contract address this market accepts evidence/probing for. */
export const NETWORK_USDC: Record<string, string> = {
  [BASE_NETWORK]: BASE_USDC_ADDRESS,
  [MONAD_NETWORK]: MONAD_USDC_ADDRESS,
  // Testnets (no real value): only so a cell's x402 test service probes as can_pay (2026-10-06).
  [MONAD_TESTNET_NETWORK]: MONAD_TESTNET_USDC_ADDRESS,
  [BASE_SEPOLIA_NETWORK]: BASE_SEPOLIA_USDC_ADDRESS,
}

/**
 * Priority order for picking the "main display network" out of several
 * supported networks a service accepts payment on — Monad first, Base
 * second. This is a Monad-first market (2026-09-29 change): a service that
 * accepts both is shown/priced/probed-for-evidence primarily on Monad, even
 * if its 402 response happens to list Base earlier in `accepts`.
 */
export const NETWORK_PRIORITY: string[] = [MONAD_NETWORK, BASE_NETWORK, MONAD_TESTNET_NETWORK, BASE_SEPOLIA_NETWORK]

export interface X402Accept {
  scheme: string
  network: string
  /** 统一成 amount（v1 的字段名是 maxAmountRequired）。基础单位字符串，USDC 是 6 位小数。 */
  amount: string | null
  asset: string | null
  payTo: string | null
  maxTimeoutSeconds?: number
}

export interface ParsedX402 {
  x402Version: 1 | 2 | number
  accepts: X402Accept[]
}

function normalizeAccept(raw: unknown): X402Accept | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const scheme = typeof r.scheme === 'string' ? r.scheme : ''
  const network = typeof r.network === 'string' ? r.network : ''
  if (!network) return null
  const amount =
    typeof r.amount === 'string' ? r.amount : typeof r.maxAmountRequired === 'string' ? r.maxAmountRequired : null
  const asset = typeof r.asset === 'string' ? r.asset : null
  const payTo = typeof r.payTo === 'string' ? r.payTo : null
  const maxTimeoutSeconds = typeof r.maxTimeoutSeconds === 'number' ? r.maxTimeoutSeconds : undefined
  return { scheme, network, amount, asset, payTo, maxTimeoutSeconds }
}

export function normalizeAccepts(raw: unknown): X402Accept[] {
  if (!Array.isArray(raw)) return []
  const out: X402Accept[] = []
  for (const item of raw) {
    const accept = normalizeAccept(item)
    if (accept) out.push(accept)
  }
  return out
}

/** 从 base64 JSON 的 v2 `PAYMENT-REQUIRED` 头解析。返回 null 表示不是合法的 v2 payload。 */
export function parseX402V2Header(headerValue: string): ParsedX402 | null {
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf8')
    const payload = JSON.parse(decoded) as Record<string, unknown>
    if (!Array.isArray(payload.accepts)) return null
    return {
      x402Version: typeof payload.x402Version === 'number' ? payload.x402Version : 2,
      accepts: normalizeAccepts(payload.accepts),
    }
  } catch {
    return null
  }
}

/** 从 v1 风格的响应体 JSON 解析（`{"x402Version":1,"accepts":[{"maxAmountRequired":...}]}`）。 */
export function parseX402V1Body(bodyText: string): ParsedX402 | null {
  try {
    const payload = JSON.parse(bodyText) as Record<string, unknown>
    if (!Array.isArray(payload.accepts)) return null
    return {
      x402Version: typeof payload.x402Version === 'number' ? payload.x402Version : 1,
      accepts: normalizeAccepts(payload.accepts),
    }
  } catch {
    return null
  }
}

/**
 * 402 响应的统一解析入口：`headerValue` 是 `PAYMENT-REQUIRED` 响应头的原始值
 * （大小写不敏感，调用方从 Headers.get() 拿），有就优先解析它；没有或解析失败
 * 就退回 `bodyText`（v1 body）。都失败返回 null。
 */
export function parseX402Response(headerValue: string | null, bodyText: string): ParsedX402 | null {
  if (headerValue) {
    const fromHeader = parseX402V2Header(headerValue)
    if (fromHeader) return fromHeader
  }
  return parseX402V1Body(bodyText)
}

/**
 * 在一个 accepts 数组里找「本市场支持的所有网络」各一条最先出现的匹配
 * （network 精确等于 eip155:143/eip155:8453 且 asset 精确等于对应链的 USDC
 * 合约，大小写不敏感），按 NETWORK_PRIORITY（Monad 优先）排序返回——最多 2
 * 条，每个支持网络最多一条。给「一个服务两条链都能付」的展示用
 * （networks 徽章/多网络证据分组）。
 */
export function findAllSupportedUsdcAccepts(accepts: X402Accept[]): X402Accept[] {
  const byNetwork = new Map<string, X402Accept>()
  for (const a of accepts) {
    const usdc = NETWORK_USDC[a.network]
    if (usdc && typeof a.asset === 'string' && a.asset.toLowerCase() === usdc.toLowerCase() && !byNetwork.has(a.network)) {
      byNetwork.set(a.network, a)
    }
  }
  const out: X402Accept[] = []
  for (const network of NETWORK_PRIORITY) {
    const a = byNetwork.get(network)
    if (a) out.push(a)
  }
  return out
}

/**
 * 在一个 accepts 数组里找「本市场支持、优先级最高」的那一条——本市场是 Monad
 * 优先市场，都命中时 Monad 赢（见 NETWORK_PRIORITY / findAllSupportedUsdcAccepts）。
 * 没有命中返回 null。
 */
export function findSupportedUsdcAccept(accepts: X402Accept[]): X402Accept | null {
  return findAllSupportedUsdcAccepts(accepts)[0] ?? null
}

/** amount 是 USDC 的基础单位字符串（6 位小数），转成人类可读的 "0.01" 这种字符串。 */
export function formatUsdcAmount(amount: string | null): string | null {
  if (amount == null) return null
  if (!/^\d+$/.test(amount)) return null
  const value = BigInt(amount)
  const million = BigInt(1_000_000)
  const whole = value / million
  const frac = (value % million).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}
