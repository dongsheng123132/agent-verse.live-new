/**
 * Extract payer address from x402 payment headers.
 * Shared between purchase and regen-key routes.
 */
export function parsePayerAddress(headers: Headers, fallback = ''): string {
  let payer = fallback
  try {
    const xPayment = headers.get('x-payment') || headers.get('payment-signature') || ''
    if (xPayment) {
      const decoded = JSON.parse(Buffer.from(xPayment, 'base64').toString())
      if (decoded?.payload?.authorization?.from) payer = decoded.payload.authorization.from
      else if (decoded?.from) payer = decoded.from
      else if (decoded?.payer) payer = decoded.payer
    }
  } catch { /* ignore decode errors */ }
  if (payer === fallback) {
    payer = headers.get('x-payment-from') || fallback
  }
  return payer
}
