import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export async function POST(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok: false, error: 'env_missing', message: '请配置 COMMERCE_API_KEY' }, { status: 500 })
    }
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const amountUsd = Number(body?.amount_usd) || 0.02
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }
    const receiptId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const origin = req.nextUrl?.origin || 'http://localhost:3005'
    const returnPath = (body?.return_path ?? '') || ''
    const redirectUrl = returnPath ? `${origin}/${returnPath}?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}` : `${origin}/?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}`
    const payload = {
      name: `Grid (${x},${y})`,
      description: `Purchase grid (${x},${y})`,
      pricing_type: 'fixed_price',
      local_price: { amount: amountUsd.toFixed(2), currency: 'USD' },
      redirect_url: redirectUrl,
      cancel_url: `${origin}/?paid=0`,
      metadata: { receipt_id: receiptId, x, y },
    }
    const res = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CC-Api-Key': process.env.COMMERCE_API_KEY },
      body: JSON.stringify(payload),
    })
    const txt = await res.text()
    if (!res.ok) return NextResponse.json({ ok: false, error: 'commerce_error', detail: txt }, { status: 502 })
    let data
    try {
      data = JSON.parse(txt)
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_response' }, { status: 502 })
    }
    const charge = data?.data
    const chargeId = charge?.id
    const hostedUrl = charge?.hosted_url
    if (!chargeId || !hostedUrl) return NextResponse.json({ ok: false, error: 'invalid_response' }, { status: 502 })
    if (process.env.DATABASE_URL) {
      try {
        await dbQuery(
          'INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, commerce_charge_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [receiptId, x, y, 0, 0, 'commerce', 'pending', chargeId]
        )
      } catch (e) {
        console.error('[commerce/create]', e?.message)
      }
    }
    return NextResponse.json({ ok: true, receiptId, charge_id: chargeId, hosted_url: hostedUrl })
  } catch (e) {
    console.error('[commerce/create]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
