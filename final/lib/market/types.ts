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

export interface MarketEntry {
  name: string
  url: string
  method: string
  description: string | null
  category: string | null
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  status: MarketStatus
  evidence: MarketEvidence | null
  source: MarketSource
  origin: MarketOrigin | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
}
