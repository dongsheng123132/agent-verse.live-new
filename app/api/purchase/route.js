/**
 * @deprecated 推荐改用 Coinbase 方案：人类用 Payment Acceptance，机器人用 x402。见 docs/COINBASE_GRID_PAYMENT.md
 */
import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export async function POST(req) {
  try {
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const mode = String(body?.mode || '')
    if (!Number.isFinite(x) || !Number.isFinite(y) || !['wallet','agentkit'].includes(mode)) {
      return NextResponse.json({ ok:false, error:'invalid_request' }, { status:400 })
    }
    const missing = []
    if (!process.env.TREASURY_ADDRESS) missing.push('TREASURY_ADDRESS')
    if (!process.env.USDC_ADDRESS) missing.push('USDC_ADDRESS')
    if (!process.env.RPC_URL) missing.push('RPC_URL')
    if (mode === 'agentkit') {
      if (!process.env.CDP_API_KEY_ID) missing.push('CDP_API_KEY_ID')
      if (!process.env.CDP_API_KEY_SECRET) missing.push('CDP_API_KEY_SECRET')
    }
    if (missing.length) {
      return NextResponse.json({ ok:false, error:'env_missing', missing }, { status:500 })
    }
    const baseAmount = Number(body?.amount_usdc) || 0.02
    const tail = Math.floor(Math.random() * 9000) + 1000
    const uniqueAmount = Math.round((baseAmount + tail / 1_000_000) * 1_000_000) / 1_000_000
    const receiptId = `r_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const treasury = process.env.TREASURY_ADDRESS
    const baseApi = process.env.PUBLIC_BASE_API || req.nextUrl?.origin || 'http://localhost:3005'
    if (process.env.DATABASE_URL) {
      await dbQuery(
        'insert into grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [receiptId, x, y, baseAmount, uniqueAmount, 'onchain', 'pending', treasury]
      )
    }
    const awal = [`npx awal auth you@example.com`,`npx awal send ${uniqueAmount} ${treasury}`].join('\n')
    const agentkitCurl = `curl -s -X POST '${baseApi}/api/purchase' -H 'Content-Type: application/json' -d '{\"x\":${x},\"y\":${y},\"amount_usdc\":${uniqueAmount},\"url\":\"\",\"mode\":\"agentkit\"}'`
    const verifyUrl = `${baseApi}/api/purchase/verify?receipt_id=${encodeURIComponent(receiptId)}&amount_usdc=${uniqueAmount}&to=${treasury}&lookback=50000`
    return NextResponse.json({
      ok:true,
      receiptId,
      mode,
      amount_usdc: uniqueAmount,
      grid: { x, y },
      status: 'accepted',
      methods: { wallet: { awal, treasury }, agentkit: { curl: agentkitCurl } },
      verify_url: verifyUrl
    })
  } catch {
    return NextResponse.json({ ok:false, error:'server_error' }, { status:500 })
  }
}
