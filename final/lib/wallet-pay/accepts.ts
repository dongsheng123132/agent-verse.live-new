import type { PaymentRequirements } from '@x402/core/types'

/**
 * A 402 response offers one `accepts` entry per chain (Monad and Base). The
 * stock x402 client picks accepts[0] — i.e. whichever chain the server listed
 * first — which is NOT what the person chose in the modal. These helpers make
 * the choice explicit and refuse to fall back to a different chain.
 */

export interface AcceptLike {
  scheme: string
  network: string
}

export class NetworkNotOfferedError extends Error {
  readonly wanted: string
  readonly offered: string[]
  constructor(wanted: string, offered: string[]) {
    super(`the server did not offer ${wanted} (it offered: ${offered.join(', ') || 'nothing'})`)
    this.name = 'NetworkNotOfferedError'
    this.wanted = wanted
    this.offered = offered
  }
}

export function acceptNetworks(accepts: AcceptLike[]): string[] {
  return accepts.map((a) => a.network)
}

/** The `exact`-scheme accept for exactly this CAIP-2 network, or null. Never any other network. */
export function pickAcceptForNetwork<T extends AcceptLike>(accepts: T[], caip2: string): T | null {
  return accepts.find((a) => a.scheme === 'exact' && a.network === caip2) ?? null
}

/**
 * x402Client `paymentRequirementsSelector` that only ever returns the entry for
 * the chosen network, and throws (instead of silently paying on another chain)
 * when the server did not offer it.
 */
export function makeNetworkSelector(caip2: string): (x402Version: number, accepts: PaymentRequirements[]) => PaymentRequirements {
  return (_version, accepts) => {
    const hit = pickAcceptForNetwork(accepts, caip2)
    if (!hit) throw new NetworkNotOfferedError(caip2, acceptNetworks(accepts))
    return hit
  }
}
