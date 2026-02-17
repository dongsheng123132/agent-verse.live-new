import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok: false, error: 'env_missing' }, { status: 500 })
    }
    const url = new URL(req.url)
    const receiptId = url.searchParams.get('receipt_id')
    const chargeIdFromQuery = url.searchParams.get('charge_id')
    let chargeId = chargeIdFromQuery
    let orderRow
    if (process.env.DATABASE_URL && receiptId) {
      const r = await dbQuery('SELECT * FROM grid_orders WHERE receipt_id = $1 LIMIT 1', [receiptId])
      if (r.rowCount) {
        orderRow = r.rows[0]
        chargeId = orderRow.commerce_charge_id || chargeId
      }
    } else if (process.env.DATABASE_URL && chargeIdFromQuery) {
      const r = await dbQuery('SELECT * FROM grid_orders WHERE commerce_charge_id = $1 LIMIT 1', [chargeIdFromQuery])
      if (r.rowCount) orderRow = r.rows[0]
    }
    if (!chargeId) return NextResponse.json({ ok: false, error: 'missing_charge_id' }, { status: 400 })

    const res = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
      headers: { 'Content-Type': 'application/json', 'X-CC-Api-Key': process.env.COMMERCE_API_KEY },
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: 'commerce_error', detail: await res.text() }, { status: 502 })
    const data = await res.json()
    const charge = data?.data
    const status = charge?.timeline?.[charge.timeline.length - 1]?.status || charge?.status
    const hasTimelineCompleted = status && ['COMPLETED', 'CONFIRMED', 'RESOLVED'].includes(String(status).toUpperCase())
    const hasPaymentDetected = Array.isArray(charge?.payments) && charge.payments.some(p => p?.transaction_id)
    const completed = hasTimelineCompleted || hasPaymentDetected

    let cellX = orderRow ? Number(orderRow.x) : Number(charge?.metadata?.x)
    let cellY = orderRow ? Number(orderRow.y) : Number(charge?.metadata?.y)
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) cellX = cellY = null

    if (completed && process.env.DATABASE_URL) {
      const firstPayment = charge?.payments?.[0]
      const owner = firstPayment?.payer_addresses?.[0] || firstPayment?.value?.address || '0xCommerce'
      if (orderRow) {
        await dbQuery('UPDATE grid_orders SET status = $1 WHERE receipt_id = $2', ['paid', orderRow.receipt_id])
      } else if (chargeId && cellX != null && cellY != null) {
        const rid = charge?.metadata?.receipt_id || `c_${chargeId}_repaired`
        await dbQuery(
          `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, commerce_charge_id)
           VALUES ($1,$2,$3,$4,$4,'commerce','paid',$5)
           ON CONFLICT (receipt_id) DO UPDATE SET status = 'paid', commerce_charge_id = EXCLUDED.commerce_charge_id`,
          [rid, cellX, cellY, 0, chargeId]
        )
      }
      if (cellX != null && cellY != null) {
        const cellId = cellY * 100 + cellX
        await dbQuery(
          `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
           VALUES ($1,$2,$3,$4,'HOLDING',false,NOW())
           ON CONFLICT (x,y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status, is_for_sale = false, last_updated = NOW()`,
          [cellId, cellX, cellY, owner]
        )
      }
    }
    return NextResponse.json({ ok: true, paid: completed, status, charge })
  } catch (e) {
    console.error('[commerce/verify]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
