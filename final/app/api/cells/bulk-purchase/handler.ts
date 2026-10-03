import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, withTransaction } from '../../../../lib/db.js'
import { generateApiKeyRaw, hashApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'
import { isReserved, PRICE_PER_CELL } from '../../../../app/types'
import { ensureSchema } from '../../../../lib/schema'
import { isShowcaseReserved } from '../../../../lib/showcase/index'
import { blockIdFor, fullRectangle, keyCellFor } from '../../../../lib/cell-block'
import {
  getSharedX402Server,
  getSharedX402Error,
  buildDualNetworkAccepts,
  verifyPayment,
  settle,
  settlementHeaders,
  cancel,
  unpaidOrErrorToResponse,
} from '../../../../lib/x402-flow'

// Split out of route.ts: Next.js's App Router route-type validation only
// allows route.ts to export recognized handlers (GET/POST/...); this file
// holds the actual (testable) logic and route.ts just re-exports GET/POST.

// Buy a whole block in one x402 payment, e.g. 10x10 = 100 cells = $10.
// Same security shape as /api/cells/purchase: validate -> verify payment ->
// reserve ALL cells atomically (all-or-nothing) -> settle -> write.
export const MAX_CELLS_PER_REQUEST = 400
const RESERVATION_TTL_SECONDS = 120

type CellCoord = { x: number; y: number }

function buildRouteConfig(totalUsd: number) {
  return {
    accepts: buildDualNetworkAccepts(totalUsd),
    description: `Purchase ${totalUsd / PRICE_PER_CELL} grid cells ($${totalUsd.toFixed(2)} USDC on Base or Monad)`,
    mimeType: 'application/json',
  }
}

function parseCells(raw: unknown): { cells: CellCoord[] } | { error: string; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'invalid_request', message: 'cells[] required' }
  }
  if (raw.length > MAX_CELLS_PER_REQUEST) {
    return { error: 'too_many_cells', message: `max ${MAX_CELLS_PER_REQUEST} cells per request` }
  }
  const cells: CellCoord[] = []
  const seen = new Set<string>()
  for (const c of raw as any[]) {
    const x = Number(c?.x)
    const y = Number(c?.y)
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return { error: 'invalid_request', message: `invalid cell (${c?.x},${c?.y})` }
    }
    if (isReserved(x, y)) {
      return { error: 'reserved', message: `(${x},${y}) is in the reserved showcase zone` }
    }
    if (isShowcaseReserved(x, y)) {
      return { error: 'reserved_showcase', message: `(${x},${y}) is part of the Monad Metropolis showcase and cannot be purchased` }
    }
    const key = `${x},${y}`
    if (!seen.has(key)) {
      seen.add(key)
      cells.push({ x, y })
    }
  }
  return { cells }
}

async function sweepExpiredReservations() {
  await dbQuery(`DELETE FROM cell_reservations WHERE expires_at < NOW()`)
}

async function anyCellTaken(cells: CellCoord[]) {
  const placeholders = cells.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(',')
  const params = cells.flatMap((c) => [c.x, c.y])
  const res = await dbQuery(
    `SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL AND (x, y) IN (VALUES ${placeholders})`,
    params
  )
  return res.rows as CellCoord[]
}

/** All-or-nothing reservation: if any cell in the batch is already reserved, roll back the whole batch. */
async function reserveAllOrNothing(cells: CellCoord[], nonce: string | null, payer: string | null, network: string) {
  let partial = false
  await withTransaction(async (client) => {
    const values: string[] = []
    const params: unknown[] = []
    cells.forEach((c, i) => {
      const b = i * 6
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},NOW() + ($${b + 6} || ' seconds')::interval)`)
      params.push(c.x, c.y, nonce, payer, network, String(RESERVATION_TTL_SECONDS))
    })
    const res = await client.query(
      `INSERT INTO cell_reservations (x, y, nonce, payer, network, expires_at)
       VALUES ${values.join(',')}
       ON CONFLICT (x, y) DO NOTHING
       RETURNING x`,
      params
    )
    if (res.rowCount !== cells.length) {
      partial = true
      throw new Error('partial_reservation')
    }
  }).catch((e: any) => {
    if (!partial) throw e
  })
  return !partial
}

async function releaseReservations(cells: CellCoord[]) {
  const placeholders = cells.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(',')
  const params = cells.flatMap((c) => [c.x, c.y])
  await dbQuery(`DELETE FROM cell_reservations WHERE (x, y) IN (VALUES ${placeholders})`, params)
}

function extractNonce(paymentPayload: unknown): string | null {
  const authorization = (paymentPayload as { payload?: { authorization?: { nonce?: string } } } | undefined)?.payload
    ?.authorization
  return typeof authorization?.nonce === 'string' ? authorization.nonce : null
}

async function anyCellTakenTx(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }, cells: CellCoord[]) {
  const placeholders = cells.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(',')
  const params = cells.flatMap((c) => [c.x, c.y])
  const res = await client.query(
    `SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL AND (x, y) IN (VALUES ${placeholders})`,
    params
  )
  return res.rows as CellCoord[]
}

export async function bulkPurchaseHandler(req: NextRequest) {
  let cells: CellCoord[]
  let body: unknown
  try {
    body = await req.json()
    const b = body as { cells?: unknown }
    const parsed = parseCells(b?.cells)
    if ('error' in parsed) {
      return NextResponse.json(parsed, { status: parsed.error === 'reserved' || parsed.error === 'reserved_showcase' ? 403 : 400 })
    }
    cells = parsed.cells
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Body must be JSON' }, { status: 400 })
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 })
  }
  try {
    await ensureSchema()
  } catch (e: any) {
    return NextResponse.json({ error: 'schema_unavailable', message: e?.message }, { status: 503 })
  }

  // ---- Step 1: reject before anyone is asked to pay. ----
  await sweepExpiredReservations()
  const taken = await anyCellTaken(cells)
  if (taken.length > 0) {
    return NextResponse.json(
      { error: 'cells_taken', message: `already owned: ${taken.map((c) => `(${c.x},${c.y})`).join(', ')}` },
      { status: 409 }
    )
  }

  const totalUsd = Math.round(cells.length * PRICE_PER_CELL * 100) / 100

  // ---- Step 2: verify payment for the whole batch. ----
  let server
  try {
    server = await getSharedX402Server()
  } catch (e: any) {
    return NextResponse.json({ error: 'x402_unavailable', message: getSharedX402Error() || e?.message }, { status: 503 })
  }
  const outcome = await verifyPayment({
    server,
    route: buildRouteConfig(totalUsd),
    req,
    path: '/api/cells/bulk-purchase',
    body,
  })
  if (outcome.kind !== 'verified') {
    return unpaidOrErrorToResponse(outcome)
  }

  // ---- Step 3: all-or-nothing reservation. ----
  const nonce = extractNonce(outcome.paymentPayload)
  const reserved = await reserveAllOrNothing(cells, nonce, outcome.payer, outcome.network)
  if (!reserved) {
    await cancel(outcome, 'handler_failed', 409)
    return NextResponse.json({ error: 'cells_taken', message: 'one or more cells were just claimed by another payment' }, { status: 409 })
  }

  // ---- Step 4: settle. ----
  let settleResult
  try {
    settleResult = await settle(outcome)
  } catch (e: any) {
    await releaseReservations(cells)
    return NextResponse.json({ error: 'x402_error', message: e?.message || 'settlement failed' }, { status: 500 })
  }
  if (!settleResult.success) {
    await releaseReservations(cells)
    return NextResponse.json(
      { error: 'settlement_failed', message: settleResult.errorReason || 'payment settlement failed' },
      { status: 402 }
    )
  }

  const owner = settleResult.payer || outcome.payer
  if (!owner) {
    await releaseReservations(cells)
    console.error('[cells/bulk-purchase] settled with no payer address', { cells, tx: settleResult.transaction })
    return NextResponse.json({ error: 'settlement_anomaly', message: 'payment settled but payer address unknown' }, { status: 500 })
  }

  const receiptId = `x402b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const apiKeyPlain = generateApiKeyRaw()
  const apiKeyHash = hashApiKey(apiKeyPlain)
  // A full w x h rectangle is stored as ONE block (shared block_id, origin = top-left) and the key belongs to
  // its origin, so one key decorates the whole block (PUT /api/cells/update works WHERE block_id = …).
  // Any other set keeps one 1x1 block per cell and the key belongs to the first cell only.
  const rect = fullRectangle(cells)
  const keyCell = keyCellFor(cells)

  let anomaly = false
  await withTransaction(async (client) => {
    const alreadyOwned = await anyCellTakenTx(client, cells)
    if (alreadyOwned.length > 0) {
      anomaly = true
      throw new Error('cell_owner_race_anomaly')
    }
    for (const { x, y } of cells) {
      const cellId = y * 100 + x
      const blockId = rect ? blockIdFor(rect) : `blk_${x}_${y}_1x1`
      const bw = rect ? rect.w : 1
      const bh = rect ? rect.h : 1
      const originX = rect ? rect.ox : x
      const originY = rect ? rect.oy : y
      await client.query(
        `INSERT INTO grid_cells (id, x, y, owner_address, status, block_id, block_w, block_h, block_origin_x, block_origin_y, last_updated)
         VALUES ($1,$2,$3,$4,'HOLDING',$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (x, y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status,
           block_id = EXCLUDED.block_id, block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h,
           block_origin_x = EXCLUDED.block_origin_x, block_origin_y = EXCLUDED.block_origin_y, last_updated = NOW()`,
        [cellId, x, y, owner, blockId, bw, bh, originX, originY]
      )
      await client.query(
        `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address, tx_hash, network, payer_address, cells_json)
         VALUES ($1,$2,$3,$4,$4,'x402-bulk','paid',$5,$6,$7,$8,$9)`,
        [
          `${receiptId}_${x}_${y}`,
          x,
          y,
          PRICE_PER_CELL,
          settleResult.requirements.payTo,
          settleResult.transaction,
          outcome.network,
          owner,
          JSON.stringify(cells),
        ]
      )
      await client.query(`DELETE FROM cell_reservations WHERE x = $1 AND y = $2`, [x, y])
    }
    await client.query(
      `INSERT INTO cell_api_keys (key_hash, x, y) VALUES ($1, $2, $3)
       ON CONFLICT (x, y) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
      [apiKeyHash, keyCell.x, keyCell.y]
    )
  }).catch((e: any) => {
    if (!anomaly) throw e
  })

  if (anomaly) {
    console.error('[cells/bulk-purchase] ANOMALY: payment settled but some cells already owned', {
      cells, tx: settleResult.transaction, network: outcome.network, payer: owner,
    })
    await releaseReservations(cells)
    return NextResponse.json({
      error: 'settlement_anomaly',
      message: 'Payment settled but one or more cells were claimed by someone else first. Contact support with this tx hash.',
      tx: settleResult.transaction,
    }, { status: 409 })
  }

  await logEvent('bulk_purchase', {
    x: keyCell.x, y: keyCell.y, blockSize: rect ? `${rect.w}x${rect.h}` : `${cells.length}`, owner,
    message: `${cells.length} cells purchased via x402 bulk on ${outcome.network}`,
  })

  return NextResponse.json({
    ok: true,
    cells,
    count: cells.length,
    total_usdc: totalUsd,
    owner,
    receipt_id: receiptId,
    api_key: apiKeyPlain,
    // the cell the key belongs to; `block` is set when the cells were stored as one block (the key then decorates all of it)
    key_cell: keyCell,
    block: rect ? { x: rect.ox, y: rect.oy, w: rect.w, h: rect.h } : null,
    network: outcome.network,
    tx_hash: settleResult.transaction,
  }, { headers: settlementHeaders(settleResult) })
}
