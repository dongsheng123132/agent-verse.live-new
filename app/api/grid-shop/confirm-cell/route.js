/**
 * POST /api/grid-shop/confirm-cell
 * Body: { x, y, owner_address }
 * 收到链上打款后，手动把格子标记为已购买（写 grid_cells）
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { dbQuery } from '../../../../lib/db.js'

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
    await dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
       VALUES ($1,$2,$3,$4,'HOLDING',false,NOW())
       ON CONFLICT (x,y) DO UPDATE SET
         owner_address = EXCLUDED.owner_address,
         status = EXCLUDED.status,
         is_for_sale = false,
         last_updated = NOW()`,
      [cellId, x, y, owner]
    )

    return NextResponse.json({ ok: true, x, y, owner })
  } catch (e) {
    console.error('[confirm-cell]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e.message }, { status: 500 })
  }
}
