import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { verifyApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'

export async function PUT(req) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ ok: false, error: 'unauthorized', message: 'Missing Authorization: Bearer gk_xxx' }, { status: 401 })
    }
    const keyInfo = await verifyApiKey(token)
    if (!keyInfo) {
      return NextResponse.json({ ok: false, error: 'unauthorized', message: 'Invalid API key' }, { status: 401 })
    }

    const body = await req.json()
    const x = Number(body?.x)
    const y = Number(body?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required and must be 0-99' }, { status: 400 })
    }
    if (keyInfo.x !== x || keyInfo.y !== y) {
      return NextResponse.json({ ok: false, error: 'forbidden', message: 'API key does not match this cell' }, { status: 403 })
    }

    const cancel = body?.cancel === true
    const priceUsdc = body?.price_usdc != null ? Number(body.price_usdc) : null

    if (cancel || priceUsdc <= 0) {
      await dbQuery(
        'UPDATE grid_cells SET is_for_sale = false, price_usdc = NULL WHERE x = $1 AND y = $2',
        [x, y]
      )
      await logEvent('resale', { x, y, message: 'Listing cancelled' })
      return NextResponse.json({ ok: true, listed: false })
    }

    await dbQuery(
      'UPDATE grid_cells SET is_for_sale = true, price_usdc = $1 WHERE x = $2 AND y = $3',
      [priceUsdc, x, y]
    )
    await logEvent('resale', { x, y, message: `Listed for $${priceUsdc} USDC` })
    return NextResponse.json({ ok: true, listed: true, price_usdc: priceUsdc })
  } catch (e) {
    console.error('[cells/list-for-sale]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
