import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'

export async function POST(req) {
  try {
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const receiptId = body?.receipt_id

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required' }, { status: 400 })
    }

    if (!receiptId) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'receipt_id required' }, { status: 400 })
    }

    // Verify receipt_id matches
    const orderRes = await dbQuery(
      'SELECT * FROM grid_orders WHERE receipt_id = $1 AND x = $2 AND y = $3 AND status = $4 LIMIT 1',
      [receiptId, x, y, 'paid']
    )

    if (!orderRes.rowCount) {
      return NextResponse.json({ ok: false, error: 'not_found', message: 'No matching paid order found' }, { status: 404 })
    }

    // Check cell has block_origin — use origin coords for key
    const cellRes = await dbQuery('SELECT block_origin_x, block_origin_y FROM grid_cells WHERE x = $1 AND y = $2', [x, y])
    const originX = cellRes.rows?.[0]?.block_origin_x ?? x
    const originY = cellRes.rows?.[0]?.block_origin_y ?? y

    const apiKey = await generateApiKey(originX, originY)
    return NextResponse.json({ ok: true, api_key: apiKey })
  } catch (e) {
    console.error('[cells/regen-key]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
