import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

/**
 * GET /api/grid/debug-owned
 * 极简调试接口：列出已经通过购买写入 grid_cells 的格子。
 * 仅返回 x,y,owner_address,price_usdc,status，方便在浏览器中快速检查。
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: 'db_not_configured' },
      { status: 500 }
    )
  }

  try {
    const res = await dbQuery(
      `select x, y, owner_address, price_usdc, status
       from grid_cells
       where owner_address is not null
       order by y asc, x asc
       limit 500`,
      []
    )

    const cells = res.rows.map((row) => ({
      x: row.x,
      y: row.y,
      owner: row.owner_address,
      price_usdc: row.price_usdc,
      status: row.status,
      id: `${row.x},${row.y}`,
    }))

    return NextResponse.json({ ok: true, total: cells.length, cells })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'db_query_failed' },
      { status: 500 }
    )
  }
}

