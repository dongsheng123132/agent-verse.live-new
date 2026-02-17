import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

// GET /api/referral/stats?code=ref_30_32
export async function GET(req) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: 'database_unavailable' }, { status: 503 })
    }
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    if (!code) {
      return NextResponse.json({ ok: false, error: 'missing_code' }, { status: 400 })
    }

    // Check referral code exists
    const refRes = await dbQuery('SELECT * FROM referrals WHERE code = $1', [code])
    if (!refRes.rowCount) {
      return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 404 })
    }
    const ref = refRes.rows[0]

    // Get rewards
    const rewardsRes = await dbQuery(
      `SELECT COUNT(*) as total_referrals,
              COALESCE(SUM(purchase_amount), 0) as total_volume,
              COALESCE(SUM(reward_amount), 0) as total_earned,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN reward_amount ELSE 0 END), 0) as pending_amount
       FROM referral_rewards WHERE referrer_code = $1`,
      [code]
    )
    const stats = rewardsRes.rows[0]

    return NextResponse.json({
      ok: true,
      code,
      owner_cell: { x: ref.owner_x, y: ref.owner_y },
      stats: {
        total_referrals: Number(stats.total_referrals),
        total_volume: Number(stats.total_volume),
        total_earned: Number(stats.total_earned),
        pending_amount: Number(stats.pending_amount),
      }
    })
  } catch (e) {
    console.error('[referral/stats]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
