import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'
import { PRICE_PER_CELL } from '../../../../app/types'
import {
  getSharedX402Server,
  getSharedX402Error,
  buildDualNetworkAccepts,
  verifyPayment,
  settle,
  cancel,
  unpaidOrErrorToResponse,
} from '../../../../lib/x402-flow'

const regenPriceStr = `$${PRICE_PER_CELL.toFixed(2)}`

function buildRouteConfig() {
  return {
    accepts: buildDualNetworkAccepts(PRICE_PER_CELL),
    description: `Recover API key for a grid cell (${regenPriceStr} USDC on Base or Monad)`,
    mimeType: 'application/json',
  }
}

export async function regenHandler(req: NextRequest) {
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
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 })
  }

  // ---- Step 1: does this cell even have an owner? No payment ask otherwise. ----
  const cellRes = await dbQuery(
    'SELECT owner_address, block_origin_x, block_origin_y FROM grid_cells WHERE x = $1 AND y = $2 AND owner_address IS NOT NULL LIMIT 1',
    [x, y]
  )
  if (!cellRes.rowCount) {
    return NextResponse.json({ error: 'cell_not_found', message: `No owned cell at (${x},${y})` }, { status: 404 })
  }
  const cell = cellRes.rows[0]
  const originX = cell.block_origin_x ?? x
  const originY = cell.block_origin_y ?? y

  // ---- Step 2: verify payment. ----
  let server
  try {
    server = await getSharedX402Server()
  } catch (e: any) {
    return NextResponse.json({ error: 'x402_unavailable', message: getSharedX402Error() || e?.message }, { status: 503 })
  }
  const outcome = await verifyPayment({ server, route: buildRouteConfig(), req, path: '/api/cells/regen-key', body })
  if (outcome.kind !== 'verified') {
    return unpaidOrErrorToResponse(outcome)
  }

  // ---- Step 3: payer must be the cell's owner. Compare BEFORE settling — a
  // stranger's payment must never be captured just to prove they aren't the owner. ----
  const ownerAddr = String(cell.owner_address || '').toLowerCase()
  const payerAddr = (outcome.payer || '').toLowerCase()
  if (!outcome.payer || payerAddr !== ownerAddr) {
    await cancel(outcome, 'handler_failed', 403)
    return NextResponse.json(
      { error: 'not_owner', message: 'Payer address does not match this cell\'s owner' },
      { status: 403 }
    )
  }

  // ---- Step 4: settle. ----
  let settleResult
  try {
    settleResult = await settle(outcome)
  } catch (e: any) {
    return NextResponse.json({ error: 'x402_error', message: e?.message || 'settlement failed' }, { status: 500 })
  }
  if (!settleResult.success) {
    return NextResponse.json(
      { error: 'settlement_failed', message: settleResult.errorReason || 'payment settlement failed' },
      { status: 402 }
    )
  }

  const apiKey = await generateApiKey(originX, originY)
  return NextResponse.json({
    ok: true,
    cell: { x, y },
    payer: outcome.payer,
    api_key: apiKey,
    network: outcome.network,
    tx_hash: settleResult.transaction,
    message: `API key regenerated for cell (${x},${y})`,
  })
}
