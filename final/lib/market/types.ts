/** Shared shapes for lib/market/* and GET /api/services (MONAD-MARKET-SPEC.md P2/P3). */

export type MarketStatus = 'verified' | 'candidate' | 'failed' | 'unprobed'
export type EvidenceSource = 'hypersync' | 'rpc-short-window'
/** 'official' = seed.json 官方收录 + Coinbase Bazaar 同步；'listing' = 格子主人自己挂牌。 */
export type MarketSource = 'official' | 'listing'
export type MarketOrigin = 'seed' | 'bazaar'

export interface MarketEvidence {
  payers_7d: number
  transfers_7d: number
  last_tx: string | null
  last_at: string | null
  source: EvidenceSource
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
  status: MarketStatus
  evidence: MarketEvidence | null
  source: MarketSource
  origin: MarketOrigin | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
}
