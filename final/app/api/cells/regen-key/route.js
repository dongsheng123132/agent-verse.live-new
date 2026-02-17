import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'

export async function POST(req) {
  try {
    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    const receiptId = body?.receipt_id
    const ownerAddr = body?.owner_address

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required' }, { status: 400 })
    }

    if (!receiptId && !ownerAddr) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'Provide receipt_id or owner_address' }, { status: 400 })
    }

    let verified = false

    // Method 1: Verify by owner address (match cell owner)
    if (ownerAddr && !verified) {
      const cellRes = await dbQuery(
        'SELECT owner_address FROM grid_cells WHERE x = $1 AND y = $2 AND owner_address IS NOT NULL LIMIT 1',
        [x, y]
      )
      if (cellRes.rowCount) {
        const dbOwner = (cellRes.rows[0].owner_address || '').toLowerCase()
        const inputOwner = ownerAddr.toLowerCase()
        // Match full address or at least first 10 chars (0x + 8 hex)
        if (dbOwner === inputOwner || (inputOwner.length >= 10 && dbOwner.startsWith(inputOwner))) {
          verified = true
        }
      }
    }

    // Method 2: Verify by receipt_id (legacy)
    if (receiptId && !verified) {
      const orderRes = await dbQuery(
        'SELECT * FROM grid_orders WHERE receipt_id = $1 AND x = $2 AND y = $3 AND status = $4 LIMIT 1',
        [receiptId, x, y, 'paid']
      )
      if (orderRes.rowCount) verified = true
    }

    if (!verified) {
      return NextResponse.json({ ok: false, error: 'not_found', message: 'Verification failed. Check coordinates and owner address.' }, { status: 404 })
    }

    // Get block origin for key generation
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
