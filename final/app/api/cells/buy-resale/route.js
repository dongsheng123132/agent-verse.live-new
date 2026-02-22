import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export async function POST(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok: false, error: 'env_missing', message: 'COMMERCE_API_KEY not configured' }, { status: 500 })
    }
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required' }, { status: 400 })
    }

    const res = await dbQuery(
      'SELECT x, y, owner_address, price_usdc FROM grid_cells WHERE x = $1 AND y = $2 AND is_for_sale = true AND price_usdc > 0',
      [x, y]
    )
    if (!res.rowCount) {
      return NextResponse.json({ ok: false, error: 'not_for_sale', message: 'Cell is not listed for sale' }, { status: 404 })
    }
    const row = res.rows[0]
    const price = Number(row.price_usdc)
    if (price <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid_price' }, { status: 400 })
    }

    const refCode = body?.ref || null
    const receiptId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const origin = req.nextUrl?.origin || 'http://localhost:3005'
    const redirectUrl = `${origin}/?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}&resale=1`

    const payload = {
      name: `Resale cell (${x},${y})`,
      description: `Purchase resale cell at (${x},${y})`,
      pricing_type: 'fixed_price',
      local_price: { amount: price.toFixed(2), currency: 'USD' },
      redirect_url: redirectUrl,
      cancel_url: `${origin}/?paid=0`,
      metadata: { receipt_id: receiptId, resale: true, x, y, ref: refCode || '' },
    }
    const chargeRes = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CC-Api-Key': process.env.COMMERCE_API_KEY },
      body: JSON.stringify(payload),
    })
    const txt = await chargeRes.text()
    if (!chargeRes.ok) return NextResponse.json({ ok: false, error: 'commerce_error', detail: txt }, { status: 502 })
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

    return NextResponse.json({ ok: true, receiptId, charge_id: chargeId, hosted_url: hostedUrl, price })
  } catch (e) {
    console.error('[cells/buy-resale]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
