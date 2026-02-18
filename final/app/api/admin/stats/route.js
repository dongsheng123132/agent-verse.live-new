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

    // 3. Referral rewards — grouped by referrer with wallet address
    const referralRes = await dbQuery(`
      SELECT
        r.code as referrer_code,
        r.owner_x,
        r.owner_y,
        gc.owner_address as referrer_wallet,
        COUNT(rr.id) as referral_count,
        COALESCE(SUM(rr.purchase_amount), 0) as total_volume,
        COALESCE(SUM(rr.reward_amount), 0) as total_reward,
        COALESCE(SUM(rr.reward_amount) FILTER (WHERE rr.status = 'pending'), 0) as pending_reward,
        COALESCE(SUM(rr.reward_amount) FILTER (WHERE rr.status = 'credited'), 0) as paid_reward
      FROM referrals r
      LEFT JOIN referral_rewards rr ON rr.referrer_code = r.code
      LEFT JOIN grid_cells gc ON gc.x = r.owner_x AND gc.y = r.owner_y
      GROUP BY r.code, r.owner_x, r.owner_y, gc.owner_address
      ORDER BY total_reward DESC
    `)

    // 4. All individual referral reward records (for audit)
    const rewardsListRes = await dbQuery(`
      SELECT
        rr.id,
        rr.referrer_code,
        rr.buyer_x,
        rr.buyer_y,
        rr.purchase_amount,
        rr.reward_amount,
        rr.status,
        rr.created_at
      FROM referral_rewards rr
      ORDER BY rr.created_at DESC
      LIMIT 100
    `)

    // 5. Recent purchases for activity overview
    const recentRes = await dbQuery(`
      SELECT
        go.receipt_id,
        go.x,
        go.y,
        go.amount_usdc,
        go.pay_method,
        go.status,
        go.ref_code,
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
      referral_summary: referralRes.rows.map(r => ({
        referrer_code: r.referrer_code,
        referrer_cell: `(${r.owner_x},${r.owner_y})`,
        referrer_wallet: r.referrer_wallet || 'unknown',
        referral_count: Number(r.referral_count),
        total_volume: Number(r.total_volume),
        total_reward: Number(r.total_reward),
        pending_reward: Number(r.pending_reward),
        paid_reward: Number(r.paid_reward),
      })),
      referral_rewards: rewardsListRes.rows,
      recent_orders: recentRes.rows,
    })
  } catch (e) {
    console.error('[admin/stats]', e)
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 })
  }
}
