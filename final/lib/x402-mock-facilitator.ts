import { randomBytes } from 'node:crypto'
import { verifyTypedData } from 'viem'
import type { FacilitatorClient } from '@x402/core/server'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'

/**
 * DEVELOPMENT / TEST ONLY. A stand-in x402 facilitator that never touches a
 * chain: it checks the buyer's EIP-3009 (TransferWithAuthorization) signature
 * locally with viem, remembers nonces so a replay is refused, and "settles" by
 * inventing a transaction hash.
 *
 * It is wired in by lib/x402-flow.ts `defaultFacilitatorClients` ONLY when
 *   process.env.NODE_ENV !== 'production'  AND  X402_FACILITATOR_MOCK === '1'
 *   AND the server is in testnet mode,
 * and that call site is written so a production `next build` drops the
 * import entirely (test/x402-mock-gate.test.ts, scripts/check-no-mock-in-build.mjs).
 * As a second, independent lock the factory below refuses to run when
 * NODE_ENV is 'production'.
 */
export const MOCK_FACILITATOR_MARKER = 'AV_MOCK_FACILITATOR_DEV_ONLY'

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

function chainIdOf(network: string): number {
  const id = Number(String(network).split(':')[1])
  if (!Number.isInteger(id)) throw new Error(`mock facilitator: unsupported network ${network}`)
  return id
}

async function checkAuthorization(payload: PaymentPayload, req: PaymentRequirements): Promise<{ ok: boolean; from?: string; nonce?: string; reason?: string }> {
  const inner = (payload as any)?.payload as { signature?: string; authorization?: Record<string, string> } | undefined
  const auth = inner?.authorization
  if (!auth || typeof inner?.signature !== 'string') return { ok: false, reason: 'invalid_payload_shape' }
  if (String(auth.to).toLowerCase() !== String(req.payTo).toLowerCase()) return { ok: false, reason: 'recipient_mismatch' }
  let value: bigint, validAfter: bigint, validBefore: bigint
  try {
    value = BigInt(auth.value)
    validAfter = BigInt(auth.validAfter)
    validBefore = BigInt(auth.validBefore)
  } catch {
    return { ok: false, reason: 'invalid_authorization_numbers' }
  }
  if (value !== BigInt((req as any).amount ?? (req as any).maxAmountRequired)) return { ok: false, reason: 'amount_mismatch' }
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < validAfter) return { ok: false, reason: 'authorization_not_yet_valid' }
  if (now >= validBefore) return { ok: false, reason: 'authorization_expired' }
  const extra = (req.extra ?? {}) as { name?: string; version?: string }
  let valid = false
  try {
    valid = await verifyTypedData({
      address: auth.from as `0x${string}`,
      domain: {
        name: extra.name,
        version: extra.version,
        chainId: chainIdOf(req.network),
        verifyingContract: req.asset as `0x${string}`,
      },
      types: authorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message: { from: auth.from as `0x${string}`, to: auth.to as `0x${string}`, value, validAfter, validBefore, nonce: auth.nonce as `0x${string}` },
      signature: inner.signature as `0x${string}`,
    })
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'invalid_signature' }
  return { ok: true, from: auth.from, nonce: auth.nonce }
}

export function createMockFacilitator(network: string): FacilitatorClient & { readonly isMock: true } {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('x402 mock facilitator must never run with NODE_ENV=production')
  }
  const usedNonces = new Set<string>()
  return {
    isMock: true as const,
    async getSupported() {
      return {
        kinds: [
          { x402Version: 1, scheme: 'exact', network },
          { x402Version: 2, scheme: 'exact', network },
        ],
        extensions: [],
        signers: {},
      } as any
    },
    async verify(payload, req) {
      const r = await checkAuthorization(payload, req)
      if (!r.ok) return { isValid: false, invalidReason: r.reason, payer: (payload as any)?.payload?.authorization?.from }
      if (usedNonces.has(String(r.nonce).toLowerCase())) return { isValid: false, invalidReason: 'nonce_already_used', payer: r.from }
      return { isValid: true, payer: r.from }
    },
    async settle(payload, req) {
      const r = await checkAuthorization(payload, req)
      if (!r.ok) return { success: false, errorReason: r.reason, transaction: '', network: req.network, payer: (payload as any)?.payload?.authorization?.from }
      const nonce = String(r.nonce).toLowerCase()
      if (usedNonces.has(nonce)) return { success: false, errorReason: 'nonce_already_used', transaction: '', network: req.network, payer: r.from }
      usedNonces.add(nonce)
      return { success: true, transaction: `0x${randomBytes(32).toString('hex')}`, network: req.network, payer: r.from }
    },
  }
}

export function createMockFacilitatorPair(networks: { base: string; monad: string }): { base: FacilitatorClient; monad: FacilitatorClient } {
  return { base: createMockFacilitator(networks.base), monad: createMockFacilitator(networks.monad) }
}
