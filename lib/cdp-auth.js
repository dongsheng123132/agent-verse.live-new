/**
 * CDP API Key → JWT Bearer Token（用于调用 business.coinbase.com / payments 等）
 */
import { generateJwt } from '@coinbase/cdp-sdk/auth'

const CDP_KEY_ID = process.env.CDP_API_KEY_ID
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET

export async function getCdpBearerToken(options = {}) {
  const { requestHost = 'business.coinbase.com', requestPath = '/api/v1/payment-links', requestMethod = 'POST' } = options
  if (!CDP_KEY_ID || !CDP_KEY_SECRET) {
    throw new Error('Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET')
  }
  return generateJwt({
    apiKeyId: CDP_KEY_ID,
    apiKeySecret: CDP_KEY_SECRET,
    requestMethod,
    requestHost,
    requestPath,
    expiresIn: 120,
  })
}
