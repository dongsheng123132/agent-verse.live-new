import type { PaymentPayload } from '@x402/core/types'

/**
 * Extract the payer's wallet address from an already-verified x402
 * PaymentPayload (the object x402HTTPResourceServer.processHTTPRequest
 * returns once SDK-level signature/authorization verification has
 * succeeded — see lib/x402-flow.ts `verifyPayment`).
 *
 * Do NOT call this with unverified, client-supplied data. Earlier code in
 * this file trusted the raw `x-payment-from` request header and fell back to
 * a placeholder owner ('0xx402') when nothing could be parsed — that let
 * anyone claim an arbitrary owner address (or skip proving payment at all)
 * simply by setting a header. That trust and that fallback are both gone:
 * the only address callers should ever persist as `owner` is the one
 * recovered here, from the payload the facilitator already verified.
 */
export function payerFromPaymentPayload(paymentPayload: PaymentPayload | null | undefined): string | null {
  try {
    const payload = paymentPayload?.payload as { authorization?: { from?: string } } | undefined
    const from = payload?.authorization?.from
    return typeof from === 'string' && /^0x[0-9a-fA-F]{40}$/.test(from) ? from : null
  } catch {
    return null
  }
}
