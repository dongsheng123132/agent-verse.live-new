/**
 * Envio HyperSync：7 天窗口链上证据的首选数据源（`ENVIO_API_TOKEN` 存在时）。
 * 没有 token 时调用方（lib/market/service.ts）完全不会调用这个文件，回退到
 * rpc.ts 的短窗口方案。
 *
 * 改写自 C:\1mineyswitch\repos\lantern-city\service\src\hypersync.ts（不跨仓库
 * import；该文件的字段/鉴权依据见其文件头注释，2026-09-29 用 curl 实测
 * https://docs.envio.dev/docs/HyperSync/*.md 得出）。与原版的区别：原版
 * HYPERSYNC_MONAD_BASE_URL 写死 Monad 一条链；这里按 network 参数化出
 * NETWORK_HYPERSYNC，新增的 Base 条目（`https://base.hypersync.xyz`）**没有
 * 实测过**——只是沿用 Envio 文档里「<chain-name>.hypersync.xyz」的命名模式，
 * 如实标注为未验证的假设。USDC 合约地址来自 lib/market/x402.ts。
 */
import { BASE_NETWORK, MONAD_NETWORK, BASE_USDC_ADDRESS, MONAD_USDC_ADDRESS } from './x402'
import { TRANSFER_TOPIC0, getBlockTimestamp, MEASURED_BLOCK_TIME_SECONDS, NETWORK_RPC } from './rpc'

export interface NetworkHyperSyncConfig {
  baseUrl: string
  usdcContract: string
}

/** Base 的 base.hypersync.xyz 未实测，只是沿用文档里的命名模式（见文件头注释）。 */
export const NETWORK_HYPERSYNC: Record<string, NetworkHyperSyncConfig> = {
  [MONAD_NETWORK]: { baseUrl: 'https://monad.hypersync.xyz', usdcContract: MONAD_USDC_ADDRESS },
  [BASE_NETWORK]: { baseUrl: 'https://base.hypersync.xyz', usdcContract: BASE_USDC_ADDRESS },
}

/** 默认证据窗口天数，可用 MARKET_EVIDENCE_DAYS 覆盖。 */
export const DEFAULT_EVIDENCE_WINDOW_DAYS = 7
export const DEFAULT_MAX_HYPERSYNC_PAGES = 50
export const DEFAULT_HYPERSYNC_TIMEOUT_MS = 20_000

export function computeWindowBlocks(days: number, blockTimeSeconds: number): number {
  return Math.max(0, Math.round((days * 86400) / blockTimeSeconds))
}

export function resolveEvidenceWindowDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MARKET_EVIDENCE_DAYS
  if (raw === undefined || raw.trim() === '') return DEFAULT_EVIDENCE_WINDOW_DAYS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EVIDENCE_WINDOW_DAYS
}

function addressToTopic(addr: string): string {
  return `0x${'0'.repeat(24)}${addr.replace(/^0x/, '').toLowerCase()}`
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase()
}

function toFiniteNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    return v.startsWith('0x') || v.startsWith('0X') ? Number.parseInt(v, 16) : Number.parseInt(v, 10)
  }
  return Number.NaN
}

export function buildHyperSyncQueryBody(
  usdcContract: string,
  payTos: string[],
  fromBlock: number,
  toBlockExclusive?: number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    from_block: fromBlock,
    logs: [
      {
        address: [usdcContract],
        topics: [[TRANSFER_TOPIC0], [], payTos.map(addressToTopic)],
      },
    ],
    field_selection: {
      block: ['number', 'timestamp'],
      log: ['block_number', 'transaction_hash', 'topic1', 'topic2'],
    },
  }
  if (toBlockExclusive !== undefined) body.to_block = toBlockExclusive
  return body
}

export class HyperSyncHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HyperSyncHttpError'
    this.status = status
  }
}

export interface HyperSyncTransportOptions {
  fetchImpl?: typeof fetch
  rpcFetchImpl?: typeof fetch
  apiToken?: string
  baseUrl?: string
  timeoutMs?: number
}

export async function getHyperSyncHeight(opts: HyperSyncTransportOptions & { baseUrl: string }): Promise<number> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HYPERSYNC_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${opts.baseUrl}/height`, { signal: controller.signal })
    if (!res.ok) throw new HyperSyncHttpError(res.status, `HyperSync /height 返回 ${res.status}`)
    const body = (await res.json()) as { height?: unknown }
    const height = toFiniteNumber(body.height)
    if (!Number.isFinite(height)) throw new Error('HyperSync /height 响应缺少合法的 height 字段')
    return height
  } finally {
    clearTimeout(timer)
  }
}

interface HyperSyncRawLog {
  block_number?: unknown
  transaction_hash?: string
  topic1?: string | null
  topic2?: string | null
}
interface HyperSyncRawBlock {
  number?: unknown
  timestamp?: unknown
}
interface HyperSyncResponseData {
  blocks?: HyperSyncRawBlock[]
  logs?: HyperSyncRawLog[]
}
interface HyperSyncQueryResponse {
  archive_height?: number | null
  next_block?: unknown
  data?: HyperSyncResponseData | HyperSyncResponseData[] | null
}

async function hyperSyncQuery(
  body: unknown,
  opts: HyperSyncTransportOptions & { baseUrl: string }
): Promise<HyperSyncQueryResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HYPERSYNC_TIMEOUT_MS
  if (!opts.apiToken) throw new Error('HyperSync 查询缺少 apiToken（ENVIO_API_TOKEN 未设置）')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${opts.baseUrl}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new HyperSyncHttpError(res.status, `HyperSync /query 返回 ${res.status}：${text || res.statusText}`)
    }
    return (await res.json()) as HyperSyncQueryResponse
  } finally {
    clearTimeout(timer)
  }
}

function extractDataGroups(resp: HyperSyncQueryResponse): HyperSyncResponseData[] {
  if (!resp.data) return []
  return Array.isArray(resp.data) ? resp.data : [resp.data]
}

function collectLogsAndBlockTimestamps(resp: HyperSyncQueryResponse): {
  logs: HyperSyncRawLog[]
  blockTimestamps: Map<number, string>
} {
  const logs: HyperSyncRawLog[] = []
  const blockTimestamps = new Map<number, string>()
  for (const group of extractDataGroups(resp)) {
    for (const log of group.logs ?? []) logs.push(log)
    for (const block of group.blocks ?? []) {
      const num = toFiniteNumber(block.number)
      const sec = toFiniteNumber(block.timestamp)
      if (Number.isFinite(num) && Number.isFinite(sec)) {
        blockTimestamps.set(num, new Date(sec * 1000).toISOString())
      }
    }
  }
  return { logs, blockTimestamps }
}

export interface HyperSyncEvidence {
  transfers: number
  distinctPayers: number
  lastTx: string | null
  lastAt: string | null
}

export interface HyperSyncScanOptions extends HyperSyncTransportOptions {
  network: string
  windowDays?: number
  maxPages?: number
  latestBlockHint?: number
}

export interface HyperSyncScanResult {
  evidence: HyperSyncEvidence
  windowDays: number
  windowBlocks: number
  truncated: boolean
  warnings: string[]
}

/**
 * 单个 (network, payTo) 的 HyperSync 7 天窗口证据。任何一页请求失败（401/429/
 * 网络错误等）直接抛出，不在这里吞掉重试——由调用方（service.ts）捕获后整体
 * 回退到 RPC 短窗口。
 */
export async function scanPayToViaHyperSync(payTo: string, opts: HyperSyncScanOptions): Promise<HyperSyncScanResult> {
  const cfg = NETWORK_HYPERSYNC[opts.network]
  if (!cfg) throw new Error(`scanPayToViaHyperSync: unsupported network ${opts.network}`)
  const baseUrl = opts.baseUrl ?? cfg.baseUrl
  const blockTimeSeconds = MEASURED_BLOCK_TIME_SECONDS[opts.network] ?? NETWORK_RPC[opts.network]?.chunkRange ?? 2
  const windowDays = opts.windowDays ?? resolveEvidenceWindowDays()
  const windowBlocksTarget = computeWindowBlocks(windowDays, blockTimeSeconds)
  const maxPages = opts.maxPages ?? DEFAULT_MAX_HYPERSYNC_PAGES
  const warnings: string[] = []
  const payToLower = payTo.toLowerCase()

  let archiveHeight = opts.latestBlockHint ?? (await getHyperSyncHeight({ ...opts, baseUrl }))
  const fromBlockStart = Math.max(0, archiveHeight - windowBlocksTarget)
  const targetToExclusive = archiveHeight + 1

  let cursor = fromBlockStart
  let coveredTo = fromBlockStart - 1
  let pagesFetched = 0
  const payers = new Set<string>()
  let transfers = 0
  let lastTx: string | null = null
  let lastAt: string | null = null
  let lastBlock = -1

  for (; pagesFetched < maxPages && cursor < targetToExclusive; pagesFetched++) {
    const resp = await hyperSyncQuery(buildHyperSyncQueryBody(cfg.usdcContract, [payTo], cursor, targetToExclusive), {
      ...opts,
      baseUrl,
    })
    if (typeof resp.archive_height === 'number') archiveHeight = resp.archive_height
    const { logs, blockTimestamps } = collectLogsAndBlockTimestamps(resp)
    for (const log of logs) {
      const to = typeof log.topic2 === 'string' ? topicToAddress(log.topic2) : null
      if (to !== payToLower) continue
      const from = typeof log.topic1 === 'string' ? topicToAddress(log.topic1) : null
      transfers += 1
      if (from && from !== to) payers.add(from)
      const blockNum = toFiniteNumber(log.block_number)
      if (Number.isFinite(blockNum) && blockNum >= lastBlock) {
        lastBlock = blockNum
        if (log.transaction_hash) lastTx = log.transaction_hash
        lastAt = blockTimestamps.get(blockNum) ?? lastAt
      }
    }
    const nextBlock = toFiniteNumber(resp.next_block)
    if (!Number.isFinite(nextBlock) || nextBlock <= cursor) {
      warnings.push(`next_block（${String(resp.next_block)}）未推进，停止分页`)
      pagesFetched += 1
      break
    }
    coveredTo = Math.min(nextBlock, targetToExclusive) - 1
    cursor = nextBlock
  }

  if (lastTx && !lastAt && lastBlock >= 0) {
    try {
      lastAt = await getBlockTimestamp(lastBlock, { rpcUrl: NETWORK_RPC[opts.network]?.rpcUrl, fetchImpl: opts.rpcFetchImpl ?? opts.fetchImpl })
    } catch (err) {
      warnings.push(`补查最后一笔（block ${lastBlock}）的区块时间失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const windowBlocks = Math.max(0, coveredTo - fromBlockStart + 1)
  const truncated = coveredTo < targetToExclusive - 1
  if (truncated && warnings.length === 0) {
    warnings.push(`达到分页上限（${maxPages} 页）仍未覆盖到目标窗口末尾（已覆盖到区块 ${coveredTo}，目标到 ${targetToExclusive - 1}）`)
  }

  return {
    evidence: { transfers, distinctPayers: payers.size, lastTx, lastAt },
    windowDays,
    windowBlocks,
    truncated,
    warnings,
  }
}
