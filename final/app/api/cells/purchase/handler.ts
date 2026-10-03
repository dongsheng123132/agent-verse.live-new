import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, withTransaction } from '../../../../lib/db.js'
import { generateApiKeyRaw, hashApiKey } from '../../../../lib/api-key.js'
import { isReserved, PRICE_PER_CELL } from '../../../../app/types'
import { ensureSchema } from '../../../../lib/schema'
import { isShowcaseReserved } from '../../../../lib/showcase/index'
import {
  getSharedX402Server,
  getSharedX402Error,
  buildDualNetworkAccepts,
  verifyPayment,
  settle,
  settlementHeaders,
  cancel,
  unpaidOrErrorToResponse,
  type VerifiedPayment,
} from '../../../../lib/x402-flow'

// Split out of route.ts: Next.js's App Router route-type validation only
// allows route.ts to export recognized handlers (GET/POST/...); this file
// holds the actual (testable) logic and route.ts just re-exports GET/POST.

// How long a payment-verified-but-not-yet-settled reservation holds a cell.
// Long enough for a facilitator settle() round-trip, short enough that a
// crashed request doesn't lock the cell out for long (opportunistically
// swept by every purchase/bulk-purchase request, not a cron job).
const RESERVATION_TTL_SECONDS = 120

function buildRouteConfig() {
  return {
    accepts: buildDualNetworkAccepts(PRICE_PER_CELL),
    description: `Purchase one grid cell ($${PRICE_PER_CELL.toFixed(2)} USDC on Base or Monad)`,
    mimeType: 'application/json',
  }
}

async function sweepExpiredReservations() {
  await dbQuery(`DELETE FROM cell_reservations WHERE expires_at < NOW()`)
}

async function reserveCell(x: number, y: number, nonce: string | null, payer: string | null, network: string) {
  const res = await dbQuery(
    `INSERT INTO cell_reservations (x, y, nonce, payer, network, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' seconds')::interval)
     ON CONFLICT (x, y) DO NOTHING
     RETURNING x`,
    [x, y, nonce, payer, network, String(RESERVATION_TTL_SECONDS)]
  )
  return res.rowCount > 0
}

async function releaseReservation(x: number, y: number) {
  await dbQuery(`DELETE FROM cell_reservations WHERE x = $1 AND y = $2`, [x, y])
}

function extractNonce(paymentPayload: VerifiedPayment['paymentPayload']): string | null {
  const authorization = (paymentPayload?.payload as { authorization?: { nonce?: string } } | undefined)?.authorization
  return typeof authorization?.nonce === 'string' ? authorization.nonce : null
}

export async function purchaseHandler(req: NextRequest) {
  let x: number, y: number
  let body: unknown
  try {
    body = await req.json()
    const b = body as { x?: unknown; y?: unknown }
    x = Number(b?.x)
    y = Number(b?.y)
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Body must be JSON with x, y' }, { status: 400 })
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 99 || y < 0 || y > 99) {
    return NextResponse.json({ error: 'invalid_request', message: 'x, y must be integers 0-99' }, { status: 400 })
  }
  // Monad Metropolis showcase cells are display-only: refuse before anything else, 402 included.
  if (isShowcaseReserved(x, y)) {
    return NextResponse.json({ error: 'reserved_showcase', message: `(${x},${y}) is part of the Monad Metropolis showcase and cannot be purchased` }, { status: 403 })
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 })
  }
  try {
    await ensureSchema()
  } catch (e: any) {
    return NextResponse.json({ error: 'schema_unavailable', message: e?.message }, { status: 503 })
  }

  // ---- Step 1: reject before we ever ask anyone to pay. ----
  if (isReserved(x, y)) {
    return NextResponse.json({ error: 'reserved', message: `(${x},${y}) is in the reserved showcase zone` }, { status: 403 })
  }
  await sweepExpiredReservations()
  const existing = await dbQuery(
    `SELECT 1 FROM grid_cells WHERE x = $1 AND y = $2 AND owner_address IS NOT NULL LIMIT 1`,
    [x, y]
  )
  if (existing.rowCount > 0) {
    return NextResponse.json({ error: 'cell_taken', message: `(${x},${y}) is already owned` }, { status: 409 })
  }

  // ---- Step 2: verify payment (no DB writes yet). ----
  let server
  try {
    server = await getSharedX402Server()
  } catch (e: any) {
    return NextResponse.json({ error: 'x402_unavailable', message: getSharedX402Error() || e?.message }, { status: 503 })
  }
  const outcome = await verifyPayment({ server, route: buildRouteConfig(), req, path: '/api/cells/purchase', body })
  if (outcome.kind !== 'verified') {
    return unpaidOrErrorToResponse(outcome)
  }

  // ---- Step 3: atomically claim the reservation. Loser gets 409, unsettled. ----
  const nonce = extractNonce(outcome.paymentPayload)
  const reserved = await reserveCell(x, y, nonce, outcome.payer, outcome.network)
  if (!reserved) {
    await cancel(outcome, 'handler_failed', 409)
    return NextResponse.json({ error: 'cell_taken', message: `(${x},${y}) was just claimed by another payment` }, { status: 409 })
  }

  // ---- Step 4: settle. ----
  let settleResult
  try {
    settleResult = await settle(outcome)
  } catch (e: any) {
    await releaseReservation(x, y)
    return NextResponse.json({ error: 'x402_error', message: e?.message || 'settlement failed' }, { status: 500 })
  }
  if (!settleResult.success) {
    await releaseReservation(x, y)
    return NextResponse.json(
      { error: 'settlement_failed', message: settleResult.errorReason || 'payment settlement failed' },
      { status: 402 }
    )
  }

  const owner = settleResult.payer || outcome.payer
  if (!owner) {
    // Settlement succeeded but we have no payer address to assign as owner —
    // this should not happen (facilitator always returns payer on success),
    // but we must not write an ownerless/attacker-chosen cell. Flag loudly.
    await releaseReservation(x, y)
    console.error('[cells/purchase] settled with no payer address', { x, y, tx: settleResult.transaction })
    return NextResponse.json({ error: 'settlement_anomaly', message: 'payment settled but payer address unknown' }, { status: 500 })
  }

  const receiptId = `x402_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const blockId = `blk_${x}_${y}_1x1`
  const cellId = y * 100 + x
  const apiKeyPlain = generateApiKeyRaw()
  const apiKeyHash = hashApiKey(apiKeyPlain)

  let anomaly = false
  await withTransaction(async (client) => {
    // Defensive re-check: the reservation should make this impossible, but
    // if it somehow isn't, do NOT overwrite an existing owner after we've
    // already collected the buyer's money — roll back and flag instead.
    const check = await client.query(
      `SELECT 1 FROM grid_cells WHERE x = $1 AND y = $2 AND owner_address IS NOT NULL LIMIT 1`,
      [x, y]
    )
    if (check.rowCount > 0) {
      anomaly = true
      throw new Error('cell_owner_race_anomaly')
    }
    await client.query(
      `INSERT INTO grid_cells (id, x, y, owner_address, status, block_id, block_w, block_h, block_origin_x, block_origin_y, last_updated)
       VALUES ($1,$2,$3,$4,'HOLDING',$5,1,1,$2,$3,NOW())
       ON CONFLICT (x, y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status,
         block_id = EXCLUDED.block_id, block_w = 1, block_h = 1, block_origin_x = $2, block_origin_y = $3, last_updated = NOW()`,
      [cellId, x, y, owner, blockId]
    )
    await client.query(
      `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address, tx_hash, network, payer_address)
       VALUES ($1,$2,$3,$4,$4,'x402','paid',$5,$6,$7,$8)`,
      [receiptId, x, y, PRICE_PER_CELL, settleResult.requirements.payTo, settleResult.transaction, outcome.network, owner]
    )
    await client.query(
      `INSERT INTO cell_api_keys (key_hash, x, y) VALUES ($1, $2, $3)
       ON CONFLICT (x, y) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
      [apiKeyHash, x, y]
    )
    await client.query(`DELETE FROM cell_reservations WHERE x = $1 AND y = $2`, [x, y])
  }).catch((e: any) => {
    if (!anomaly) throw e
  })

  if (anomaly) {
    console.error('[cells/purchase] ANOMALY: payment settled but cell already owned', {
      x, y, tx: settleResult.transaction, network: outcome.network, payer: owner,
    })
    // The transaction rolled back (reservation row survives it) and the true
    // owner already exists in grid_cells, so the reservation no longer
    // protects anything — drop it so a legitimate future request for this
    // (now permanently anomalous) cell doesn't wait out the TTL for nothing.
    await releaseReservation(x, y)
    return NextResponse.json({
      error: 'settlement_anomaly',
      message: 'Payment settled but this cell was claimed by someone else first. Contact support with this tx hash.',
      tx: settleResult.transaction,
    }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    cell: { x, y },
    owner,
    receipt_id: receiptId,
    api_key: apiKeyPlain,
    network: outcome.network,
    tx_hash: settleResult.transaction,
  }, { headers: settlementHeaders(settleResult) })
}
