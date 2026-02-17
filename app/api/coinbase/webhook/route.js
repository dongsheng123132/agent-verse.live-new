/**
 * Coinbase Payment Link Webhook：支付成功后回写 grid_cells
 * 需在 CDP / Business 控制台把此 URL 配为 webhook，事件选 payment_link.payment.success
 */
import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const eventType = body?.event?.type || body?.type
    if (eventType !== 'payment_link.payment.success' && eventType !== 'payment_link.paid') {
      return NextResponse.json({ received: true })
    }

    const paymentLinkId = body?.data?.id || body?.data?.payment_link_id || body?.payment_link_id
    const metadata = body?.data?.metadata || body?.metadata || {}
    const x = Number(metadata.x ?? body?.data?.metadata?.x)
    const y = Number(metadata.y ?? body?.data?.metadata?.y)

    if (!paymentLinkId) {
      return NextResponse.json({ error: 'no_payment_link_id' }, { status: 400 })
    }

    let cellX = x
    let cellY = y
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) {
      if (!process.env.DATABASE_URL) return NextResponse.json({ received: true })
      const row = await dbQuery(
        'SELECT x, y FROM coinbase_payment_links WHERE payment_link_id = $1 AND status = $2',
        [paymentLinkId, 'pending']
      )
      if (!row.rows.length) return NextResponse.json({ received: true })
      cellX = row.rows[0].x
      cellY = row.rows[0].y
    }

    const owner = body?.data?.payer_address || body?.data?.from_address || body?.from || '0xCoinbasePay'

    if (process.env.DATABASE_URL) {
      const cellId = cellY * 100 + cellX
      await dbQuery(
        `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
         VALUES ($1,$2,$3,$4,'HOLDING',false,NOW())
         ON CONFLICT (x,y) DO UPDATE SET
           owner_address = EXCLUDED.owner_address,
           status = EXCLUDED.status,
           is_for_sale = false,
           last_updated = NOW()`,
        [cellId, cellX, cellY, owner]
      )
      await dbQuery(
        'UPDATE coinbase_payment_links SET status = $1 WHERE payment_link_id = $2',
        ['paid', paymentLinkId]
      )
    }

    return NextResponse.json({ received: true, cell: { x: cellX, y: cellY } })
  } catch (e) {
    console.error('coinbase webhook', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
