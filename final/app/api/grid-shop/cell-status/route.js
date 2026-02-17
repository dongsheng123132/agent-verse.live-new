import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const x = Number(url.searchParams.get('x'))
    const y = Number(url.searchParams.get('y'))
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ error: 'invalid x,y' }, { status: 400 })
    }
    if (!process.env.DATABASE_URL) return NextResponse.json({ purchased: false, message: 'no_database' })
    const r = await dbQuery('SELECT id, x, y, owner_address, status FROM grid_cells WHERE x = $1 AND y = $2 LIMIT 1', [x, y])
    const cell = r.rows[0] || null
    return NextResponse.json({
      x,
      y,
      purchased: !!(cell && cell.owner_address),
      owner: cell?.owner_address || null,
      status: cell?.status || null,
    })
  } catch (e) {
    console.error('[cell-status]', e)
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 })
  }
}
