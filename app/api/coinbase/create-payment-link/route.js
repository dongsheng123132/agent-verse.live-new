/**
 * 创建 Coinbase Payment Link（人类买格子）
 * POST body: { x, y, successRedirectUrl?, failRedirectUrl? }
 * 返回: { url, paymentLinkId } 前端跳转 url 完成支付
 */
import { NextResponse } from 'next/server'
import { getCdpBearerToken } from '../../../../lib/cdp-auth.js'
import { dbQuery } from '../../../../lib/db.js'
import { randomUUID } from 'crypto'

const PRICE_USDC = 2
// Coinbase 要求 redirect 必须 HTTPS；本地可用 ngrok 或填 NEXT_PUBLIC_BASE_API 为 https 地址
const BASE_URL = process.env.NEXT_PUBLIC_BASE_API ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  'https://agent-verse-live-new.vercel.app'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const x = Number(body?.x)
    const y = Number(body?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ error: 'invalid_request', message: 'x,y 需为 0-99 整数' }, { status: 400 })
    }

    const successRedirectUrl = body.successRedirectUrl || `${BASE_URL}/grid-v3?paid=1&x=${x}&y=${y}`
    const failRedirectUrl = body.failRedirectUrl || `${BASE_URL}/grid-v3?paid=0`

    const token = await getCdpBearerToken()
    const idempotencyKey = randomUUID()

    const res = await fetch('https://business.coinbase.com/api/v1/payment-links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount: String(PRICE_USDC),
        currency: 'USDC',
        network: 'base',
        description: `Grid cell (${x},${y})`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        successRedirectUrl,
        failRedirectUrl,
        metadata: { x: String(x), y: String(y) },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Coinbase Payment Link create failed', res.status, err)
      return NextResponse.json({ error: 'payment_link_failed', detail: err }, { status: 502 })
    }

    const data = await res.json()
    const paymentLinkId = data.id || data.paymentLinkId
    const url = data.url || data.hosted_url

    if (!paymentLinkId || !url) {
      return NextResponse.json({ error: 'invalid_response', data }, { status: 502 })
    }

    if (process.env.DATABASE_URL) {
      await dbQuery(
        `INSERT INTO coinbase_payment_links (payment_link_id, x, y, status) VALUES ($1,$2,$3,'pending')
         ON CONFLICT (payment_link_id) DO NOTHING`,
        [paymentLinkId, x, y]
      )
    }

    return NextResponse.json({ url, paymentLinkId, x, y, amount: PRICE_USDC })
  } catch (e) {
    console.error('create-payment-link', e)
    return NextResponse.json({ error: 'server_error', message: e.message }, { status: 500 })
  }
}
