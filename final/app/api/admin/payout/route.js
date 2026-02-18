import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

function checkAdmin(req) {
  const auth = req.headers.get('x-admin-key') || ''
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey || !auth || auth !== adminKey) return false
  return true
}

// POST: Mark referral rewards as paid
// Body: { referrer_code: "ref_30_32", tx_hash?: "0x..." }
// Or: { reward_ids: [1, 2, 3], tx_hash?: "0x..." }
export async function POST(req) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const txHash = body.tx_hash || null

    let result
    if (body.referrer_code) {
      // Mark all pending rewards for a referrer as credited
      result = await dbQuery(
        `UPDATE referral_rewards
         SET status = 'credited'
         WHERE referrer_code = $1 AND status = 'pending'
         RETURNING id, reward_amount`,
        [body.referrer_code]
      )
    } else if (body.reward_ids && Array.isArray(body.reward_ids)) {
      // Mark specific reward IDs as credited
      result = await dbQuery(
        `UPDATE referral_rewards
         SET status = 'credited'
         WHERE id = ANY($1) AND status = 'pending'
         RETURNING id, reward_amount`,
        [body.reward_ids]
      )
    } else {
      return NextResponse.json({
        error: 'invalid_request',
        message: 'Provide referrer_code or reward_ids'
      }, { status: 400 })
    }

    const marked = result.rows
    const totalPaid = marked.reduce((s, r) => s + Number(r.reward_amount), 0)

    return NextResponse.json({
      ok: true,
      marked_count: marked.length,
      total_paid: totalPaid,
      tx_hash: txHash,
      reward_ids: marked.map(r => r.id),
    })
  } catch (e) {
    console.error('[admin/payout]', e)
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 })
  }
}
