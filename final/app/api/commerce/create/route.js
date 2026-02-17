import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { getBlockPrice, getBlockLabel } from '../../../../lib/pricing.js'

const RESERVED_DIAGONALS = new Set([
  '20,20','25,25','30,30','33,33','35,35','40,40','44,44','45,45',
  '50,50','55,55','60,60','66,66','70,70','75,75','77,77','80,80',
  '85,85','88,88','90,90','95,95','99,99'
])

function isReserved(x, y) {
  if (x < 16 && y < 16) return true
  return RESERVED_DIAGONALS.has(`${x},${y}`)
}

export async function POST(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok: false, error: 'env_missing', message: '请配置 COMMERCE_API_KEY' }, { status: 500 })
    }
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const blockW = Number(body?.block_w) || 1
    const blockH = Number(body?.block_h) || 1

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }

    const price = getBlockPrice(blockW, blockH)
    if (price === null) {
      return NextResponse.json({ ok: false, error: 'invalid_block_size', message: `不支持的尺寸 ${blockW}×${blockH}` }, { status: 400 })
    }

    // Check block fits in grid
    if (x + blockW > 100 || y + blockH > 100) {
      return NextResponse.json({ ok: false, error: 'out_of_bounds', message: '块超出网格范围' }, { status: 400 })
    }

    // Check reserved zones
    for (let dy = 0; dy < blockH; dy++) {
      for (let dx = 0; dx < blockW; dx++) {
        if (isReserved(x + dx, y + dy)) {
          return NextResponse.json({ ok: false, error: 'reserved', message: '该区域包含保留格子，不可购买' }, { status: 403 })
        }
      }
    }

    // Check all cells in block are available
    if (process.env.DATABASE_URL) {
      const coords = []
      for (let dy = 0; dy < blockH; dy++) {
        for (let dx = 0; dx < blockW; dx++) {
          coords.push(`(${x + dx},${y + dy})`)
        }
      }
      const res = await dbQuery(
        `SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL AND (x, y) IN (${coords.join(',')})`,
        []
      )
      if (res.rowCount > 0) {
        const sold = res.rows.map(r => `(${r.x},${r.y})`).join(', ')
        return NextResponse.json({ ok: false, error: 'cells_taken', message: `已售出: ${sold}` }, { status: 409 })
      }
    }

    const receiptId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const origin = req.nextUrl?.origin || 'http://localhost:3005'
    const returnPath = (body?.return_path ?? '') || ''
    const redirectUrl = returnPath
      ? `${origin}/${returnPath}?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}`
      : `${origin}/?paid=1&x=${x}&y=${y}&receipt_id=${receiptId}`

    const label = getBlockLabel(blockW, blockH)
    const payload = {
      name: `Grid ${label} (${x},${y})`,
      description: `Purchase ${label} block at (${x},${y})`,
      pricing_type: 'fixed_price',
      local_price: { amount: price.toFixed(2), currency: 'USD' },
      redirect_url: redirectUrl,
      cancel_url: `${origin}/?paid=0`,
      metadata: { receipt_id: receiptId, x, y, block_w: blockW, block_h: blockH },
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
          [receiptId, x, y, price, 0, 'commerce', 'pending', chargeId]
        )
      } catch (e) {
        console.error('[commerce/create]', e?.message)
      }
    }
    return NextResponse.json({ ok: true, receiptId, charge_id: chargeId, hosted_url: hostedUrl, price, block: { w: blockW, h: blockH, label } })
  } catch (e) {
    console.error('[commerce/create]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
