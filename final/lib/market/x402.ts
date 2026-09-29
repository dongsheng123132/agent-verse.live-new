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
 */
import { BASE_NETWORK, MONAD_NETWORK, MONAD_USDC_ADDRESS } from '../x402-flow'

export { BASE_NETWORK, MONAD_NETWORK }
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export { MONAD_USDC_ADDRESS }

/** network -> USDC contract address this market accepts evidence/probing for. */
export const NETWORK_USDC: Record<string, string> = {
  [BASE_NETWORK]: BASE_USDC_ADDRESS,
  [MONAD_NETWORK]: MONAD_USDC_ADDRESS,
}

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
 * 在一个 accepts 数组里找「Base 或 Monad 主网 USDC」的那一条（network 精确等于
 * eip155:8453/eip155:143 且 asset 精确等于对应链的 USDC 合约，大小写不敏感）。
 * Base 优先于 Monad（都命中时取第一条 accepts 里先出现的那个网络）。
 */
export function findSupportedUsdcAccept(accepts: X402Accept[]): X402Accept | null {
  for (const a of accepts) {
    const usdc = NETWORK_USDC[a.network]
    if (usdc && typeof a.asset === 'string' && a.asset.toLowerCase() === usdc.toLowerCase()) {
      return a
    }
  }
  return null
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
