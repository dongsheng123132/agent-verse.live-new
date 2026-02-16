import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export async function GET(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok:false, error:'env_missing', missing:['COMMERCE_API_KEY'] }, { status:500 })
    }
    const url = new URL(req.url)
    const receiptId = url.searchParams.get('receipt_id')
    const chargeIdFromQuery = url.searchParams.get('charge_id')
    let chargeId = chargeIdFromQuery
    let orderRow
    if (process.env.DATABASE_URL && receiptId) {
      const res = await dbQuery('select * from grid_orders where receipt_id = $1 limit 1', [receiptId])
      if (!res.rowCount) {
        return NextResponse.json({ ok:false, error:'order_not_found' }, { status:404 })
      }
      orderRow = res.rows[0]
      chargeId = orderRow.commerce_charge_id || chargeId
    }
    if (!chargeId) {
      return NextResponse.json({ ok:false, error:'missing_charge_id' }, { status:400 })
    }
    const res = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': process.env.COMMERCE_API_KEY
      }
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ ok:false, error:'commerce_error', detail:txt }, { status:502 })
    }
    const data = await res.json()
    const charge = data?.data
    const status = charge?.timeline?.[charge.timeline.length - 1]?.status || charge?.status
    const completed = status && ['COMPLETED','CONFIRMED','RESOLVED'].includes(status.toUpperCase())
    if (completed && process.env.DATABASE_URL && orderRow) {
      await dbQuery(
        'update grid_orders set status = $1 where receipt_id = $2',
        ['paid', orderRow.receipt_id]
      )
    }
    return NextResponse.json({ ok:true, paid: completed, status, charge })
  } catch {
    return NextResponse.json({ ok:false, error:'server_error' }, { status:500 })
  }
}

