/**
 * GET /api/grid-v3/activity
 * 返回最近购买成功记录，供 SYSTEM_LOGS LIVE 播报。
 */
import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ activity: [] })
    }
    const res = await dbQuery(
      `SELECT receipt_id, x, y, amount_usdc, pay_method, created_at
       FROM grid_orders
       WHERE status = 'paid'
       ORDER BY created_at DESC
       LIMIT 50`,
      []
    )
    const activity = res.rows.map((row) => ({
      id: `purchase-${row.receipt_id}`,
      timestamp: new Date(row.created_at).getTime(),
      type: 'TRANSACTION',
      message: `Cell [${row.x},${row.y}] 购买成功 · ${Number(row.amount_usdc)} USDC · ${row.pay_method || 'payment'}`,
      author: 'GRID_SHOP',
      cost: Number(row.amount_usdc),
    }))
    return NextResponse.json({ activity })
  } catch (e) {
    console.error('[grid-v3/activity]', e)
    return NextResponse.json({ activity: [] })
  }
}
