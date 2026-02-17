import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: 'no_database' }, { status: 500 })
    }
    const body = await req.json().catch(() => ({}))
    const x = Number(body?.x)
    const y = Number(body?.y)
    const owner = String(body?.owner_address || body?.owner || '').trim()
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ ok: false, error: 'invalid x,y' }, { status: 400 })
    }
    if (!owner || !owner.startsWith('0x') || owner.length < 10) {
      return NextResponse.json({ ok: false, error: 'invalid owner_address' }, { status: 400 })
    }
    const cellId = y * 100 + x
    const amountUsd = process.env.PURCHASE_PRICE_USD || '0.02'
    const receiptId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
       VALUES ($1,$2,$3,$4,'HOLDING',false,NOW())
       ON CONFLICT (x,y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status, is_for_sale = false, last_updated = NOW()`,
      [cellId, x, y, owner]
    )
    try {
      await dbQuery(
        `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address) VALUES ($1,$2,$3,$4,$4,'manual','paid',$5)`,
        [receiptId, x, y, amountUsd, process.env.TREASURY_ADDRESS || '']
      )
    } catch (e) {
      console.error('[confirm-cell] grid_orders insert failed:', e?.message)
    }
    return NextResponse.json({ ok: true, x, y, owner, receipt_id: receiptId })
  } catch (e) {
    console.error('[confirm-cell]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
