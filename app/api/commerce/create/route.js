import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export async function POST(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({
        ok: false,
        error: 'env_missing',
        missing: ['COMMERCE_API_KEY'],
        message: 'Coinbase Commerce 未配置。请使用「让 AI 帮你付款」或「手动转账」方式，或在 Vercel 环境变量中配置 COMMERCE_API_KEY。'
      }, { status: 500 })
    }
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const amountUsd = Number(body?.amount_usd) || 2
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok:false, error:'invalid_request' }, { status:400 })
    }
    const receiptId = `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const origin = req.nextUrl?.origin || 'http://localhost:3005'
    const returnPath = (body?.return_path === 'grid-shop') ? 'grid-shop' : 'grid-v3'
    const payload = {
      name: `Grid (${x},${y})`,
      description: `Purchase grid (${x},${y})`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: amountUsd.toFixed(2),
        currency: 'USD'
      },
      redirect_url: `${origin}/${returnPath}?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}`,
      cancel_url: `${origin}/${returnPath}?paid=0`,
      metadata: {
        receipt_id: receiptId,
        x,
        y
      }
    }
    const res = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': process.env.COMMERCE_API_KEY
      },
      body: JSON.stringify(payload)
    })
    const txt = await res.text()
    if (!res.ok) {
      return NextResponse.json({ ok:false, error:'commerce_error', detail:txt }, { status:502 })
    }
    let data
    try {
      data = JSON.parse(txt)
    } catch {
      return NextResponse.json({ ok:false, error:'invalid_commerce_response', detail:txt?.slice(0, 200) }, { status:502 })
    }
    const charge = data?.data
    const chargeId = charge?.id
    const hostedUrl = charge?.hosted_url
    if (!chargeId || !hostedUrl) {
      return NextResponse.json({ ok:false, error:'invalid_commerce_response' }, { status:502 })
    }
    if (process.env.DATABASE_URL) {
      try {
        await dbQuery(
          'insert into grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, commerce_charge_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [receiptId, x, y, 0, 0, 'commerce', 'pending', chargeId]
        )
      } catch (dbErr) {
        console.error('[commerce/create] DB insert failed:', dbErr.message)
      }
    }
    return NextResponse.json({ ok:true, receiptId, charge_id: chargeId, hosted_url: hostedUrl })
  } catch (e) {
    console.error('[commerce/create]', e)
    return NextResponse.json(
      { ok: false, error: 'server_error', message: e?.message || String(e) },
      { status: 500 }
    )
  }
}

