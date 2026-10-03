import { vi } from 'vitest'
import type { Network, SupportedResponse } from '@x402/core/types'

/**
 * Minimal FacilitatorClient double (verify/settle/getSupported — the whole
 * interface @x402/core's x402ResourceServer needs). `verify` and `settle`
 * are vi.fn() so individual tests can override behavior with
 * mockImplementationOnce/mockResolvedValueOnce without rebuilding the
 * resource server.
 */
export function createMockFacilitator(network: Network) {
  const verify = vi.fn(async (paymentPayload: any, _requirements: any) => ({
    isValid: true,
    payer: paymentPayload?.payload?.authorization?.from,
  }))
  const settle = vi.fn(async (paymentPayload: any, requirements: any) => ({
    success: true,
    transaction: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
    network: requirements.network,
    payer: paymentPayload?.payload?.authorization?.from,
  }))
  // Real facilitators advertise support for both x402Version 1 and 2 kinds.
  // We need v2 registered because @x402/core's buildPaymentRequirements()
  // always checks facilitator support at the *current* protocol version (2,
  // hardcoded), regardless of which version an inbound payload actually
  // uses; and v1 registered because our test payloads use x402Version 1
  // (see buildPaymentHeaderValue) and getFacilitatorClient() looks up by the
  // payload's own version when routing verify()/settle() to a facilitator.
  const getSupported = vi.fn(async (): Promise<SupportedResponse> => ({
    kinds: [
      { x402Version: 1, scheme: 'exact', network },
      { x402Version: 2, scheme: 'exact', network },
    ],
    extensions: [],
    signers: {},
  }))
  return { verify, settle, getSupported }
}

let nonceCounter = 0

/** Builds a base64 X-PAYMENT (v1) header value structurally valid enough to
 * pass @x402/core's findMatchingRequirements (v1 path only checks
 * scheme+network) and reach our mocked facilitator's verify()/settle(). */
export function buildPaymentHeaderValue(opts: {
  network: string
  from: string
  payTo?: string
  amount?: string
  nonce?: string
}) {
  nonceCounter += 1
  const nonce = opts.nonce ?? `0xnonce${nonceCounter}${Date.now()}`
  const payload = {
    x402Version: 1,
    accepted: {
      scheme: 'exact',
      network: opts.network,
      asset: '0xAsset',
      amount: opts.amount ?? '100000',
      payTo: opts.payTo ?? '0xTreasury',
      maxTimeoutSeconds: 60,
      extra: {},
    },
    payload: {
      authorization: {
        from: opts.from,
        to: opts.payTo ?? '0xTreasury',
        value: opts.amount ?? '100000',
        validAfter: '0',
        validBefore: '99999999999',
        nonce,
      },
      signature: '0x' + 'ab'.repeat(65),
    },
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}
