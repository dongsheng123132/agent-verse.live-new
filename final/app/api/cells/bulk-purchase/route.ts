import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'
import { ensureRefCode, trackReferral } from '../../../../lib/referral.js'
import { parsePayerAddress } from '../../../../lib/parse-payment'
import { OWNER_X402, NULL_ADDRESS } from '../../../../lib/constants'
import { PRICE_PER_CELL, calcTotalPrice } from '../../../../lib/pricing.js'

// Replaces Coinbase Commerce /api/commerce/create for multi-cell checkout.
// Commerce was deprecated 2026-03-31; this route does the same job with x402 +
// a single dynamic-priced 402 handshake covering all cells in the payload.

const payTo = process.env.TREASURY_ADDRESS || NULL_ADDRESS

function isReserved(x: number, y: number) {
  return x < 16 && y < 16
}

type Cell = { x: number; y: number }

async function validateCells(cells: Cell[]) {
  if (cells.length > 1000) {
    return { error: 'too_many_cells', message: 'max 1000 cells per request' }
  }
  for (const c of cells) {
    const x = Number(c?.x), y = Number(c?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
      return { error: 'invalid_request', message: `invalid cell (${c?.x},${c?.y})` }
    }
    if (isReserved(x, y)) {
      return { error: 'reserved', message: `(${x},${y}) is reserved` }
    }
  }
  if (!process.env.DATABASE_URL) return null
  const placeholders = cells.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(',')
  const params = cells.flatMap(c => [Number(c.x), Number(c.y)])
  const res = await dbQuery(
    `SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL AND (x, y) IN (VALUES ${placeholders})`,
    params
  )
  if (res.rowCount > 0) {
    const sold = res.rows.map((r: any) => `(${r.x},${r.y})`).join(', ')
    return { error: 'cells_taken', message: `已售出: ${sold}` }
  }
  return null
}

// Build a one-shot x402 handler whose price is computed from THIS request's
// cells count. We rebuild the handler per request because @x402/next bakes
// price into route config at init time.
async function buildX402(totalPriceUsd: number, handler: (req: NextRequest) => Promise<Response>) {
  const { withX402 } = await import('@x402/next')
  const { x402ResourceServer, HTTPFacilitatorClient } = await import('@x402/core/server')
  const { registerExactEvmScheme } = await import('@x402/evm/exact/server')

  let facilitatorConfig: any
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
    const { createFacilitatorConfig } = await import('@coinbase/x402')
    facilitatorConfig = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
  } else {
    const { facilitator } = await import('@coinbase/x402')
    facilitatorConfig = facilitator
  }

  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig)
  const server = new x402ResourceServer(facilitatorClient)
  registerExactEvmScheme(server, { networks: ['eip155:8453'] })
  await server.initialize()

  const routeConfig = {
    accepts: [{ scheme: 'exact', price: `$${totalPriceUsd.toFixed(2)}`, network: 'eip155:8453', payTo }],
    description: `Purchase ${totalPriceUsd / PRICE_PER_CELL} grid cells ($${totalPriceUsd.toFixed(2)} USDC on Base)`,
    mimeType: 'application/json',
  }
  return withX402(handler, routeConfig, server, undefined, undefined, false)
}

async function writeCells(cells: Cell[], owner: string, receiptId: string, totalUsd: number, refParam: string | null) {
  const firstCellKeys: string[] = []
  for (const { x, y } of cells) {
    const cellId = y * 100 + x
    const blockId = `blk_${x}_${y}_1x1`
    await dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y, last_updated)
       VALUES ($1,$2,$3,$4,'HOLDING',false,$5,1,1,$2,$3,NOW())
       ON CONFLICT (x, y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status, is_for_sale = false,
         block_id = EXCLUDED.block_id, block_w = 1, block_h = 1, block_origin_x = $2, block_origin_y = $3, last_updated = NOW()`,
      [cellId, x, y, owner, blockId]
    )
    try {
      await dbQuery(
        `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address)
         VALUES ($1,$2,$3,$4,$4,'x402-bulk','paid',$5)`,
        [`${receiptId}_${x}_${y}`, x, y, PRICE_PER_CELL, payTo]
      )
    } catch (e) {
      console.error('[bulk-purchase] grid_orders insert failed:', (e as Error)?.message)
    }
    firstCellKeys.push(`(${x},${y})`)
  }

  await logEvent('bulk_purchase', { cellCount: cells.length, totalUsd, owner, receiptId, message: `${cells.length} cells purchased via x402 bulk` })

  if (refParam && cells[0]) {
    try {
      await trackReferral(refParam, { receiptId, buyerX: cells[0].x, buyerY: cells[0].y, purchaseAmount: totalUsd })
    } catch (e) {
      console.error('[bulk-purchase] referral tracking failed:', (e as Error)?.message)
    }
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cells/bulk-purchase',
    method: 'POST',
    body: '{ cells: [{x,y},...], ref?: string }',
    pricing: `$${PRICE_PER_CELL} × cells.length`,
    network: 'Base (eip155:8453)',
    payTo,
    cdp_auth: !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET),
    replaces: '/api/commerce/create (Coinbase Commerce deprecated 2026-03-31)',
  })
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 })
  }

  let cells: Cell[]
  let refParam: string | null = null
  // Clone so the x402 middleware can still read the body if it needs to.
  const reqForX402 = req.clone() as NextRequest
  try {
    const body = await req.json()
    cells = body?.cells
    refParam = body?.ref || null
    if (!Array.isArray(cells) || cells.length === 0) {
      return NextResponse.json({ error: 'invalid_request', message: 'cells[] required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Body must be JSON' }, { status: 400 })
  }

  const validationError = await validateCells(cells)
  if (validationError) return NextResponse.json(validationError, { status: 400 })

  const totalUsd = calcTotalPrice(cells.length)
  const receiptId = `x402b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Stash the already-parsed body so the inner handler doesn't re-read the stream.
  const handler = async (innerReq: NextRequest) => {
    const owner = parsePayerAddress(innerReq.headers, OWNER_X402)
    await writeCells(cells, owner, receiptId, totalUsd, refParam)

    let apiKey: string | null = null
    if (cells[0]) {
      try {
        apiKey = await generateApiKey(cells[0].x, cells[0].y)
      } catch (e) {
        console.error('[bulk-purchase] api key generation failed:', (e as Error)?.message)
      }
    }
    const refCode = cells[0] ? await ensureRefCode(cells[0].x, cells[0].y) : null

    return NextResponse.json({
      ok: true,
      cells,
      count: cells.length,
      total_usdc: totalUsd,
      owner,
      receipt_id: receiptId,
      api_key: apiKey,
      ref_code: refCode,
    })
  }

  try {
    const x402Handler = await buildX402(totalUsd, handler)
    return await x402Handler(reqForX402)
  } catch (e: any) {
    console.error('[bulk-purchase] x402 failed:', e)
    return NextResponse.json({
      error: 'x402_error',
      message: e?.message || 'x402 processing failed',
    }, { status: 500 })
  }
}
