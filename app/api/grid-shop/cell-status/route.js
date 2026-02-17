/**
 * GET /api/grid-shop/cell-status?x=24&y=19
 * 查某格子是否已在数据库里标记为已购买（grid_cells 有 owner）
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { dbQuery } from '../../../../lib/db.js'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const x = Number(url.searchParams.get('x'))
    const y = Number(url.searchParams.get('y'))
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return NextResponse.json({ error: 'invalid x,y' }, { status: 400 })
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ purchased: false, message: 'no_database' })
    }

    const cellRes = await dbQuery(
      'SELECT id, x, y, owner_address, status FROM grid_cells WHERE x = $1 AND y = $2 LIMIT 1',
      [x, y]
    )
    const cell = cellRes.rows[0] || null

    const ordersRes = await dbQuery(
      'SELECT receipt_id, status, pay_method, commerce_charge_id, created_at FROM grid_orders WHERE x = $1 AND y = $2 ORDER BY created_at DESC LIMIT 5',
      [x, y]
    )

    return NextResponse.json({
      x,
      y,
      purchased: !!(cell && cell.owner_address),
      owner: cell?.owner_address || null,
      status: cell?.status || null,
      orders: ordersRes.rows,
    })
  } catch (e) {
    console.error('[cell-status]', e)
    return NextResponse.json({ error: 'server_error', message: e.message }, { status: 500 })
  }
}
