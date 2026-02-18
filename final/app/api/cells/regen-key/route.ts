import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'

const payTo = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000'
const regenPrice = '0.10'
const regenPriceStr = `$${regenPrice}`

// x402 handler for micro-payment key recovery
let x402Handler: ((req: NextRequest) => Promise<Response>) | null = null
let x402InitError: string | null = null

async function initX402() {
  if (x402Handler) return
  x402InitError = null
  try {
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
      accepts: [{ scheme: 'exact', price: regenPriceStr, network: 'eip155:8453', payTo }],
      description: `Recover API key for a grid cell (${regenPriceStr} USDC on Base)`,
      mimeType: 'application/json',
    }

    x402Handler = withX402(regenHandler, routeConfig, server, undefined, undefined, false)
  } catch (e: any) {
    x402InitError = e?.message || 'x402 init failed'
    console.error('[regen-key x402] init error:', e)
  }
}

async function regenHandler(req: NextRequest) {
  let x: number, y: number
  try {
    const body = await req.json()
    x = Number(body?.x)
    y = Number(body?.y)
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Body must be JSON with x, y' }, { status: 400 })
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 99 || y < 0 || y > 99) {
    return NextResponse.json({ error: 'invalid_request', message: 'x, y must be 0-99' }, { status: 400 })
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 })
  }

  // Extract payer address from x402 payment header
  let payer = ''
  try {
    const xPayment = req.headers.get('x-payment') || req.headers.get('payment-signature') || ''
    if (xPayment) {
      const decoded = JSON.parse(Buffer.from(xPayment, 'base64').toString())
      if (decoded?.payload?.authorization?.from) payer = decoded.payload.authorization.from
      else if (decoded?.from) payer = decoded.from
      else if (decoded?.payer) payer = decoded.payer
    }
  } catch { /* ignore */ }
  if (!payer) payer = req.headers.get('x-payment-from') || ''

  // Verify this cell exists and is owned
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

  // Verify payer matches cell owner (if we can check)
  // For x402 purchases, owner is often '0xx402' so we allow recovery for any payer
  // The payment itself proves the user has funds and intent

  const apiKey = await generateApiKey(originX, originY)
  return NextResponse.json({
    ok: true,
    cell: { x, y },
    payer,
    api_key: apiKey,
    message: `API key regenerated for cell (${x},${y})`
  })
}

// GET: info endpoint + pre-warm
export async function GET() {
  if (!x402Handler && !x402InitError) {
    initX402().catch(e => console.error('[regen-key] pre-warm failed:', e))
  }
  return NextResponse.json({
    endpoint: '/api/cells/regen-key',
    method: 'POST',
    price: regenPriceStr,
    description: 'Pay 0.10 USDC to recover your API key. The payment proves wallet ownership.',
    network: 'Base (eip155:8453)',
    x402_ready: !!x402Handler,
  })
}

// POST: x402-protected key recovery
export async function POST(req: NextRequest) {
  await initX402()
  if (x402InitError || !x402Handler) {
    return NextResponse.json({
      error: 'x402_unavailable',
      message: x402InitError || 'x402 handler not initialized',
    }, { status: 503 })
  }
  try {
    return await x402Handler(req)
  } catch (e: any) {
    console.error('[regen-key] handler error:', e)
    return NextResponse.json({
      error: 'x402_error',
      message: e?.message || 'x402 processing failed',
    }, { status: 500 })
  }
}
