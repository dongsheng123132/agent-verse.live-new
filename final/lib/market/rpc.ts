/**
 * 链上只读证据（RPC 短窗口兜底）：查 USDC 合约的 Transfer 日志（topic2 = payTo），
 * 统计窗口内笔数、不同付款人数、最后一笔 tx/时间。
 *
 * 改写自 C:\1mineyswitch\repos\lantern-city\service\src\rpc.ts（不跨仓库
 * import）。原版只查 Monad；这里按 network 参数化成 Base/Monad 都能查，因为本
 * 仓库的格子服务两条链都可能挂（MONAD-MARKET-SPEC.md）。Monad 的分段/限速参数
 * （100 块/请求上限、每候选地址扫 6 段）照抄原版的实测结论（见原文件头注释）；
 * Base 的参数是本次新增、没有做同等实测，用了更保守的公开 RPC 常见上限
 * （2000 块/请求）——如实标注为未实测的假设，不是确认过的事实。
 */
import { BASE_NETWORK, MONAD_NETWORK, BASE_USDC_ADDRESS, MONAD_USDC_ADDRESS } from './x402'
import { mapWithConcurrency } from './concurrency'

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export interface NetworkRpcConfig {
  rpcUrl: string
  usdcContract: string
  /** eth_getLogs 单次请求的区块范围上限。 */
  chunkRange: number
  /** 每个候选 payTo 默认扫多少个分段。 */
  maxChunks: number
}

/**
 * Monad 主网 rpcUrl/chunkRange 沿用 lantern-city 的实测值（见文件头注释）。
 * Base 主网用官方公共 RPC（https://mainnet.base.org），chunkRange=2000 是未
 * 实测的保守假设，可用 BASE_RPC_URL 环境变量覆盖 rpcUrl。
 */
export const NETWORK_RPC: Record<string, NetworkRpcConfig> = {
  [MONAD_NETWORK]: {
    rpcUrl: process.env.MONAD_RPC_URL_MARKET || 'https://rpc.monad.xyz',
    usdcContract: MONAD_USDC_ADDRESS,
    chunkRange: 100,
    maxChunks: 6,
  },
  [BASE_NETWORK]: {
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    usdcContract: BASE_USDC_ADDRESS,
    chunkRange: 2000,
    maxChunks: 6,
  },
}

export const DEFAULT_RPC_CONCURRENCY = 4
/** Monad 实测出块时间（秒），见 rpc.ts 原版头注释；Base 约 2 秒/块（公开资料，未在本次实测）。 */
export const MEASURED_BLOCK_TIME_SECONDS: Record<string, number> = {
  [MONAD_NETWORK]: 0.302,
  [BASE_NETWORK]: 2,
}

export interface LogChunkPlan {
  fromBlock: number
  toBlock: number
}

/**
 * 从 `latestBlock` 往回切分成若干段，每段宽度 <= `chunkRange`，最多 `maxChunks`
 * 段，遇到 0 就停。纯函数，方便单测。
 */
export function planLogChunks(latestBlock: number, chunkRange: number, maxChunks: number): LogChunkPlan[] {
  const plans: LogChunkPlan[] = []
  let to = latestBlock
  for (let i = 0; i < maxChunks && to >= 0; i++) {
    const from = Math.max(to - chunkRange, 0)
    plans.push({ fromBlock: from, toBlock: to })
    if (from === 0) break
    to = from - 1
  }
  return plans
}

/** 一批分段总共覆盖的区块数（含首尾），用来填 evidence.windowBlocks。 */
export function totalWindowBlocks(plans: LogChunkPlan[]): number {
  if (plans.length === 0) return 0
  const highest = plans[0].toBlock
  const lowest = plans[plans.length - 1].fromBlock
  return highest - lowest + 1
}

export interface RawLog {
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
}

export interface ParsedTransfer {
  from: string
  to: string
  blockNumber: number
  transactionHash: string
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase()
}

/** 解析一条 ERC-20 Transfer 日志（topics[1]=from, topics[2]=to，都是 32 字节左零填充的地址）。 */
export function parseTransferLog(log: RawLog): ParsedTransfer | null {
  if (!Array.isArray(log.topics) || log.topics.length < 3) return null
  return {
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    blockNumber: Number.parseInt(log.blockNumber, 16),
    transactionHash: log.transactionHash,
  }
}

export interface TransferSummary {
  transfers: number
  distinctPayers: number
  lastTransfer: ParsedTransfer | null
}

/**
 * 证据分级的核心统计：`transfers` 是窗口内全部笔数（含自转），`distinctPayers`
 * 只数 from !== payTo 的不同地址（自转不算「付款人」）。`lastTransfer` 取
 * blockNumber 最大的一条。
 */
export function summarizeTransfers(transfers: ParsedTransfer[], payTo: string): TransferSummary {
  const payToLower = payTo.toLowerCase()
  const payers = new Set<string>()
  let last: ParsedTransfer | null = null
  for (const t of transfers) {
    if (t.from !== payToLower) payers.add(t.from)
    if (!last || t.blockNumber >= last.blockNumber) last = t
  }
  return { transfers: transfers.length, distinctPayers: payers.size, lastTransfer: last }
}

/** 0 笔或只有自转 -> candidate；至少一笔非自转 -> verified（点亮）。 */
export function deriveStatusFromSummary(summary: TransferSummary): 'verified' | 'candidate' {
  return summary.distinctPayers >= 1 ? 'verified' : 'candidate'
}

// ---- JSON-RPC 传输 ----

export interface RpcCallOptions {
  rpcUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

let rpcIdCounter = 1

async function rpcCall<T>(method: string, params: unknown[], opts: RpcCallOptions): Promise<T> {
  const rpcUrl = opts.rpcUrl
  if (!rpcUrl) throw new Error('rpcCall: rpcUrl is required')
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcIdCounter++, method, params }),
      signal: controller.signal,
    })
    const body = (await res.json()) as { result?: T; error?: { code: number; message: string } }
    if (body.error) {
      throw new Error(`RPC ${method} 出错：${body.error.message} (code ${body.error.code})`)
    }
    return body.result as T
  } finally {
    clearTimeout(timer)
  }
}

export async function getLatestBlockNumber(opts: RpcCallOptions): Promise<number> {
  const hex = await rpcCall<string>('eth_blockNumber', [], opts)
  return Number.parseInt(hex, 16)
}

/** 单段 eth_getLogs：address=USDC 合约，topics=[Transfer, null, payTo]（topic2 过滤 to=payTo）。 */
export async function getLogsChunk(
  usdcContract: string,
  payTo: string,
  plan: LogChunkPlan,
  opts: RpcCallOptions
): Promise<RawLog[]> {
  const payToTopic = `0x${'0'.repeat(24)}${payTo.replace(/^0x/, '').toLowerCase()}`
  const params = [
    {
      fromBlock: `0x${plan.fromBlock.toString(16)}`,
      toBlock: `0x${plan.toBlock.toString(16)}`,
      address: usdcContract,
      topics: [TRANSFER_TOPIC0, null, payToTopic],
    },
  ]
  return rpcCall<RawLog[]>('eth_getLogs', params, opts)
}

/** 补查一次区块时间戳（HyperSync 响应没带时间戳字段时用）。 */
export async function getBlockTimestamp(blockNumber: number, opts: RpcCallOptions): Promise<string | null> {
  try {
    const block = await rpcCall<{ timestamp: string } | null>(
      'eth_getBlockByNumber',
      [`0x${blockNumber.toString(16)}`, false],
      opts
    )
    if (!block) return null
    return new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString()
  } catch {
    return null
  }
}

export interface ScanEvidence {
  transfers: number
  distinctPayers: number
  lastTx: string | null
  lastAt: string | null
  windowBlocks: number
  status: 'verified' | 'candidate'
}

export interface ScanOptions {
  network: string
  latestBlock: number
  fetchImpl?: typeof fetch
  timeoutMs?: number
  concurrency?: number
}

/**
 * 扫一个 (network, payTo) 在最近若干分段窗口内的 Transfer 证据。单段查询失败
 * （超时/RPC 报错）会被跳过并计入 warnings，不让整个扫描因为一段失败就报错。
 */
export async function scanPayToEvidence(payTo: string, opts: ScanOptions): Promise<{ evidence: ScanEvidence; warnings: string[] }> {
  const cfg = NETWORK_RPC[opts.network]
  if (!cfg) throw new Error(`scanPayToEvidence: unsupported network ${opts.network}`)
  const concurrency = opts.concurrency ?? DEFAULT_RPC_CONCURRENCY
  const plans = planLogChunks(opts.latestBlock, cfg.chunkRange, cfg.maxChunks)
  const rpcOpts: RpcCallOptions = { rpcUrl: cfg.rpcUrl, fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs }

  const warnings: string[] = []
  const chunkResults = await mapWithConcurrency(plans, concurrency, async (plan) => {
    try {
      return await getLogsChunk(cfg.usdcContract, payTo, plan, rpcOpts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`分段 [${plan.fromBlock}, ${plan.toBlock}] 查询失败：${msg}`)
      return [] as RawLog[]
    }
  })

  const transfers = chunkResults
    .flat()
    .map(parseTransferLog)
    .filter((t): t is ParsedTransfer => t !== null)
  const summary = summarizeTransfers(transfers, payTo)
  const status = deriveStatusFromSummary(summary)
  const lastAt = summary.lastTransfer ? await getBlockTimestamp(summary.lastTransfer.blockNumber, rpcOpts) : null

  return {
    evidence: {
      transfers: summary.transfers,
      distinctPayers: summary.distinctPayers,
      lastTx: summary.lastTransfer?.transactionHash ?? null,
      lastAt,
      windowBlocks: totalWindowBlocks(plans),
      status,
    },
    warnings,
  }
}
