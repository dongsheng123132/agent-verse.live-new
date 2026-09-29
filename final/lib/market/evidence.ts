/**
 * 证据对象的构造 + 归一化 + 按网络算状态——三件事都集中在这一个文件里，是因为
 * 它们要在两个地方产生完全一致的结果：探测刚发生时（lib/market/service.ts，
 * 数据新鲜，直接从 rpc.ts/hypersync.ts 的返回值构造）和从数据库读出来的时候
 * （lib/market/market.ts 的 mapOfficialRow/mapListingRow，数据可能是旧版本
 * 写入的、缺 network/window 字段）。两处各写一份换算逻辑很容易漂移。
 *
 * 2026-09-30 诚实标注修复（见 lib/market/types.ts MarketEvidence 头注释）：
 * 这里新增的 `network` + `window`（人类可读时长）字段，以及
 * `computeStatusByNetwork` ——都是为了让「哪条链、多长窗口、算不算
 * verified」这三件事对每个网络分别成立，而不是像以前那样把「任一网络有证据
 * 就点亮」的判定结果套到所有网络头上。
 */
import type { EvidenceSource, MarketEvidence, MarketNetworkOffer, MarketStatus } from './types'
import { humanizeWindowBlocks } from './rpc'

export interface BuildMarketEvidenceParams {
  network: string
  payers: number
  transfers: number
  lastTx: string | null
  lastAt: string | null
  source: EvidenceSource
  windowBlocks: number
}

/** 从一次刚做完的链上扫描结果构造 MarketEvidence——唯一一处同时填新旧字段名的地方。 */
export function buildMarketEvidence(params: BuildMarketEvidenceParams): MarketEvidence {
  return {
    network: params.network,
    payers: params.payers,
    transfers: params.transfers,
    last_tx: params.lastTx,
    last_at: params.lastAt,
    source: params.source,
    window: { blocks: params.windowBlocks, human: humanizeWindowBlocks(params.network, params.windowBlocks) },
    // 向后兼容旧字段名（同一份数据，见 lib/market/types.ts MarketEvidence 的 @deprecated 注释）。
    payers_7d: params.payers,
    transfers_7d: params.transfers,
    window_blocks: params.windowBlocks,
  }
}

/**
 * 归一化一条「从数据库读出来的」证据 JSON：可能是本次改动之后写入的新形状
 * （已经有 network/payers/window），也可能是旧版本写入的存量数据（只有
 * payers_7d/transfers_7d/window_blocks，没有 network/window/payers/transfers）。
 * `fallbackNetwork` 只在旧数据缺 network 字段时用——旧数据本身就没区分过网络
 * （这正是本次要修的问题），用调用方传入的主显示网络做尽力而为的标注，不假装
 * 比实际掌握的信息更精确。
 */
export function normalizeStoredEvidence(raw: unknown, fallbackNetwork: string | null): MarketEvidence | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const payers = typeof r.payers === 'number' ? r.payers : typeof r.payers_7d === 'number' ? r.payers_7d : 0
  const transfers = typeof r.transfers === 'number' ? r.transfers : typeof r.transfers_7d === 'number' ? r.transfers_7d : 0
  const rawWindow = r.window && typeof r.window === 'object' ? (r.window as Record<string, unknown>) : null
  const windowBlocks =
    typeof rawWindow?.blocks === 'number' ? rawWindow.blocks : typeof r.window_blocks === 'number' ? r.window_blocks : 0
  const network = typeof r.network === 'string' && r.network ? r.network : fallbackNetwork ?? ''
  const source: EvidenceSource = r.source === 'hypersync' ? 'hypersync' : 'rpc-short-window'
  const human = typeof rawWindow?.human === 'string' ? rawWindow.human : humanizeWindowBlocks(network, windowBlocks)
  return {
    network,
    payers,
    transfers,
    last_tx: typeof r.last_tx === 'string' ? r.last_tx : null,
    last_at: typeof r.last_at === 'string' ? r.last_at : null,
    source,
    window: { blocks: windowBlocks, human },
    payers_7d: payers,
    transfers_7d: transfers,
    window_blocks: windowBlocks,
  }
}

/**
 * 每个受支持网络各自的状态：该网络自己的证据有 >=1 个非自转付款人 ->
 * verified；探测到这个网络但证据 0 付款人（或证据缺失/查询失败）-> candidate。
 * `networks` 为空（从没探测成功过/没有匹配的 accept）时返回 null——不存在
 * "这个服务在哪些网络上是什么状态"这个问题。
 */
export function computeStatusByNetwork(
  networks: MarketNetworkOffer[] | null,
  evidenceByNetwork: Record<string, MarketEvidence> | null
): Record<string, MarketStatus> | null {
  if (!networks || networks.length === 0) return null
  const out: Record<string, MarketStatus> = {}
  for (const n of networks) {
    const ev = evidenceByNetwork?.[n.network]
    out[n.network] = ev && ev.payers >= 1 ? 'verified' : 'candidate'
  }
  return out
}
