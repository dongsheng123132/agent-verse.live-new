import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

function checkAdmin(req) {
  const key = req.headers.get('x-admin-key') || new URL(req.url).searchParams.get('key')
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey || !key || key !== adminKey) return false
  return true
}

export async function GET(req) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    // 1. Overall sales stats
    const salesRes = await dbQuery(`
      SELECT
        COUNT(*) FILTER (WHERE owner_address IS NOT NULL) as sold_cells,
        COUNT(*) as total_cells,
        COUNT(DISTINCT block_id) FILTER (WHERE block_id IS NOT NULL AND owner_address IS NOT NULL) as sold_blocks
      FROM grid_cells
    `)

    // 2. Revenue from orders
    const revenueRes = await dbQuery(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(amount_usdc), 0) as total_revenue,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
        COALESCE(SUM(amount_usdc) FILTER (WHERE status = 'completed'), 0) as completed_revenue,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders
      FROM grid_orders
    `)

    // 3. Recent orders
    const recentRes = await dbQuery(`
      SELECT
        go.receipt_id,
        go.x,
        go.y,
        go.amount_usdc,
        go.pay_method,
        go.status,
        go.created_at,
        gc.owner_address
      FROM grid_orders go
      LEFT JOIN grid_cells gc ON gc.x = go.x AND gc.y = go.y
      ORDER BY go.created_at DESC
      LIMIT 50
    `)

    const sales = salesRes.rows[0]
    const revenue = revenueRes.rows[0]

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),

      overview: {
        sold_cells: Number(sales.sold_cells),
        total_cells: Number(sales.total_cells),
        sold_blocks: Number(sales.sold_blocks),
        total_orders: Number(revenue.total_orders),
        completed_orders: Number(revenue.completed_orders),
        pending_orders: Number(revenue.pending_orders),
        total_revenue_usdc: Number(revenue.total_revenue),
        completed_revenue_usdc: Number(revenue.completed_revenue),
      },
      recent_orders: recentRes.rows,
    })
  } catch (e) {
    console.error('[admin/stats]', e)
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 })
  }
}
