/** Shared shapes for lib/market/* and GET /api/services (MONAD-MARKET-SPEC.md P2/P3). */

export type MarketStatus = 'verified' | 'candidate' | 'failed' | 'unprobed'
export type EvidenceSource = 'hypersync' | 'rpc-short-window'
/** 'official' = seed.json 官方收录 + Coinbase Bazaar 同步；'listing' = 格子主人自己挂牌。 */
export type MarketSource = 'official' | 'listing'
export type MarketOrigin = 'seed' | 'bazaar'

/** 证据窗口：区块数 + 换算成人类可读时长（如「约 6.7 小时」「7 天」），见 lib/market/rpc.ts humanizeWindowBlocks。 */
export interface EvidenceWindow {
  blocks: number
  human: string
}

/**
 * 2026-09-30 诚实标注修复：之前这个字段没有 `network`，导致「某网络的 evidence
 * 挂在另一网络的 verified 状态上」看起来像是同一件事（见 lib/market/service.ts
 * 头注释、docs 里记录的 agent402 案例——Base 链上的真实付款证据，被顶层 evidence
 * 字段原样搬到 Monad 视图里显示，且没有任何字段说明这其实是 Base 证据）。
 * 现在每条证据显式带自己的 network + source + window，不再靠调用方脑补。
 *
 * payers_7d/transfers_7d/window_blocks 保留一个版本做向后兼容（原字段名，值和
 * payers/transfers/window.blocks 相同）——前端新代码一律只读 payers/transfers/window。
 */
export interface MarketEvidence {
  /** 这条证据是在哪条链上查到的（eip155:143 = Monad，eip155:8453 = Base）。 */
  network: string
  /** 窗口内的不同付款人数（不含收款地址自转）。 */
  payers: number
  /** 窗口内的全部转账笔数（含自转）。 */
  transfers: number
  last_tx: string | null
  last_at: string | null
  source: EvidenceSource
  window: EvidenceWindow
  /** @deprecated 用 payers；保留兼容旧前端/旧存量数据，下一版本删除。 */
  payers_7d: number
  /** @deprecated 用 transfers；保留兼容旧前端/旧存量数据，下一版本删除。 */
  transfers_7d: number
  /** @deprecated 用 window.blocks；保留兼容旧前端/旧存量数据，下一版本删除。 */
  window_blocks: number
}

export interface SeedEntry {
  name: string
  url: string
  method: 'GET' | 'POST'
  note: string
}

/** One supported network's own price/payTo/asset — see lib/market/x402.ts findAllSupportedUsdcAccepts. */
export interface MarketNetworkOffer {
  network: string
  price_usdc: string | null
  payTo: string | null
  asset: string | null
}

export interface MarketEntry {
  name: string
  url: string
  method: string
  description: string | null
  category: string | null
  /** Main display network (Monad-priority; see NETWORK_PRIORITY) — kept for backward compat. */
  network: string | null
  /** Main display network's price — kept for backward compat. */
  price_usdc: string | null
  pay_to: string | null
  /** Every network this service accepts USDC on (Monad first), for network badges. Null when never probed/no match. */
  networks: MarketNetworkOffer[] | null
  /**
   * "Best of any supported network" status — kept for backward compat (this is
   * what `status` has always meant). When a caller filters by a specific
   * network (GET /api/services?network=...), getMarketServices() overrides
   * this field per-entry to that network's OWN status (see status_by_network)
   * so a Base-only verified service no longer shows VERIFIED in the Monad view.
   */
  status: MarketStatus
  /** Every supported network's own status, computed only from that network's own evidence. Null when never probed/no supported network. */
  status_by_network: Record<string, MarketStatus> | null
  /** "Best of any supported network" evidence — kept for backward compat (this is what `evidence` has always meant; see evidence_by_network for the honest per-network breakdown). */
  evidence: MarketEvidence | null
  /** Every supported network's own on-chain evidence, keyed by network (e.g. "eip155:143"/"eip155:8453"). Null when never probed/no evidence gathered. */
  evidence_by_network: Record<string, MarketEvidence> | null
  /**
   * Set only when the response was filtered by network and this entry's
   * network-scoped status differs from the "best of any network" one — e.g.
   * "Monad 候选 · Base 已验证" for a service whose only real payment evidence
   * is on Base while the caller is viewing the Monad market.
   */
  status_label: string | null
  source: MarketSource
  origin: MarketOrigin | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
  /**
   * Groups interfaces that share the same receiving wallet on the same
   * network ("network:payTo", lowercased) — falls back to "origin:<host>"
   * when payTo is unknown. See lib/market/market.ts groupSellers(): the same
   * payTo can front many interfaces (e.g. agent402's 15 tools), and evidence
   * is wallet-level, not interface-level — grouping by seller_id is how
   * /market avoids implying each interface has its own independent proof.
   */
  seller_id: string
}

/** One seller (receiving wallet, or origin host when no payTo is known) with all its interfaces grouped together — see lib/market/market.ts groupSellers(). */
export interface MarketSellerGroup {
  seller_id: string
  network: string | null
  pay_to: string | null
  origin_host: string | null
  service_count: number
  /** Best status across this seller's interfaces (network-scoped when the response was filtered by network) — used to sort seller groups. */
  status: MarketStatus
  services: MarketEntry[]
}
