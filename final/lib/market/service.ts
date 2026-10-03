/**
 * One service (a cell's service_url, or a curated seed.json entry): a
 * read-only 402 probe (lib/market/probe.ts, SSRF check included). That is all
 * the index claims: no on-chain payment evidence is gathered or shown.
 * method !== 'GET' is never fetched and comes back 'unchecked'.
 */
import { probeCellService } from './probe'
import type { ProbeNetworkResult } from './probe'
import { installMarketOutboundProxyIfConfigured } from './net-proxy'
import type { X402Accept } from './x402'
import type { MarketStatus } from './types'

export interface ServiceProbeResult {
  status: MarketStatus
  accepts: X402Accept[] | null
  /** Main display network (Monad first). */
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  /** Every network the 402 offered Monad/Base USDC on; null unless status is can_pay. */
  networks: ProbeNetworkResult[] | null
  probed_at: string | null
  note: string
}

export interface ProbeServiceOptions {
  fetchImpl?: typeof fetch
}

export async function probeService(url: string, method: string, opts: ProbeServiceOptions = {}): Promise<ServiceProbeResult> {
  // Local dev behind Clash / v2rayN: Node's fetch ignores HTTPS_PROXY, so route the probe through it. No-op in production.
  installMarketOutboundProxyIfConfigured()
  const probe = await probeCellService({ url, method }, { fetchImpl: opts.fetchImpl })
  return {
    status: probe.status,
    accepts: probe.accepts,
    network: probe.network,
    price_usdc: probe.price_usdc,
    pay_to: probe.payTo,
    networks: probe.networks,
    probed_at: probe.probedAt,
    note: probe.note,
  }
}
