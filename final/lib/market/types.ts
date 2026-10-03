/** Shared shapes for lib/market/* and GET /api/services. */

/**
 * What a service's status means (2026-10-03: probe-only, no on-chain evidence):
 *  - can_pay   : a read-only GET returned a valid x402 v2 402 offering USDC on
 *                the network(s) in `networks` (nothing was paid).
 *  - failed    : the GET did not get such a 402 (unreachable, not a 402, an x402 v1
 *                402, no Monad/Base USDC offer, or rejected by the SSRF check).
 *  - unchecked : not checked: a POST service (it needs a body, we never send one)
 *                or not probed yet.
 */
export type MarketStatus = 'can_pay' | 'failed' | 'unchecked'

/**
 * What the database stores. grid_cells.probe_status has a CHECK constraint
 * (verified | candidate | failed | unprobed) and tables are not altered, so the
 * columns keep their old vocabulary; these two functions are the only place that
 * translates between it and MarketStatus. A legacy 'verified' row passed the same
 * probe as 'candidate' did (the evidence part is gone), so both read as can_pay.
 */
export type StoredProbeStatus = 'verified' | 'candidate' | 'failed' | 'unprobed'

export function fromStoredStatus(raw: unknown): MarketStatus {
  if (raw === 'can_pay' || raw === 'verified' || raw === 'candidate') return 'can_pay'
  if (raw === 'failed') return 'failed'
  return 'unchecked'
}

export function toStoredStatus(status: MarketStatus): StoredProbeStatus {
  if (status === 'can_pay') return 'candidate'
  if (status === 'failed') return 'failed'
  return 'unprobed'
}

/** 'official' = curated seed.json; 'listing' = a cell owner's own service_url. */
export type MarketSource = 'official' | 'listing'
export type MarketOrigin = 'seed'

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
  /** Main display network (Monad first; see NETWORK_PRIORITY in lib/market/x402.ts). */
  network: string | null
  /** Main display network's price. */
  price_usdc: string | null
  pay_to: string | null
  /** Every network the 402 offered Monad/Base USDC on (Monad first). Null when not probed or no match. */
  networks: MarketNetworkOffer[] | null
  status: MarketStatus
  source: MarketSource
  origin: MarketOrigin | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
}
