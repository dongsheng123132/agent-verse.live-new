import { dbQuery } from './db.js'

const REWARD_RATE = 0.10 // 10% commission

export function makeRefCode(x, y) {
  return `ref_${x}_${y}`
}

/**
 * Ensure a referral code exists for a cell owner.
 * Called after purchase to auto-create the code.
 */
export async function ensureRefCode(x, y) {
  const code = makeRefCode(x, y)
  try {
    await dbQuery(
      `INSERT INTO referrals (code, owner_x, owner_y) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [code, x, y]
    )
  } catch (e) {
    console.error('[referral] ensureRefCode:', e?.message)
  }
  return code
}

/**
 * Track a referral reward when a purchase completes.
 */
export async function trackReferral(refCode, { receiptId, buyerX, buyerY, purchaseAmount }) {
  if (!refCode) return
  try {
    // Verify the code exists
    const res = await dbQuery('SELECT code FROM referrals WHERE code = $1', [refCode])
    if (!res.rowCount) return

    const rewardAmount = Number(purchaseAmount) * REWARD_RATE
    await dbQuery(
      `INSERT INTO referral_rewards (referrer_code, buyer_receipt_id, buyer_x, buyer_y, purchase_amount, reward_amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [refCode, receiptId, buyerX, buyerY, purchaseAmount, rewardAmount]
    )
  } catch (e) {
    console.error('[referral] trackReferral:', e?.message)
  }
}

export { REWARD_RATE }
