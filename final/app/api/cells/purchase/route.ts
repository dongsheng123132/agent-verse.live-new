import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'
import { ensureRefCode, trackReferral } from '../../../../lib/referral.js'

const payTo = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000'
const priceUsd = process.env.PURCHASE_PRICE_USD || '0.50'
const priceStr = `$${priceUsd}`

// Lazy-init x402 to avoid module-level crashes on Vercel
let x402Handler: ((req: NextRequest) => Promise<Response>) | null = null
let x402InitError: string | null = null

async function initX402() {
  if (x402Handler) return
  // Reset error on retry
  x402InitError = null
  try {
    const { withX402 } = await import('@x402/next')
    const { x402ResourceServer, HTTPFacilitatorClient } = await import('@x402/core/server')
    const { registerExactEvmScheme } = await import('@x402/evm/exact/server')

    // Use @coinbase/x402 for CDP-authenticated facilitator config
    let facilitatorConfig: any
    if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
      const { createFacilitatorConfig } = await import('@coinbase/x402')
      facilitatorConfig = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
    } else {
      // Fallback: try default facilitator (may fail without auth)
      const { facilitator } = await import('@coinbase/x402')
      facilitatorConfig = facilitator
    }

    const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig)
    const server = new x402ResourceServer(facilitatorClient)
    registerExactEvmScheme(server, { networks: ['eip155:8453'] })

    // Must initialize to fetch supported schemes from facilitator
    await server.initialize()

    const routeConfig = {
      accepts: [{ scheme: 'exact', price: priceStr, network: 'eip155:8453', payTo }],
      description: `Purchase one grid cell (${priceStr} USDC on Base)`,
      mimeType: 'application/json',
    }

    // syncFacilitatorOnStart=false since we already called initialize()
    x402Handler = withX402(purchaseHandler, routeConfig, server, undefined, undefined, false)
  } catch (e: any) {
    x402InitError = e?.message || 'x402 init failed'
    console.error('[x402] init error:', e)
  }
}

async function purchaseHandler(req: NextRequest) {
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
  const cellId = y * 100 + x
  const owner = req.headers.get('x-payment-from') || '0xx402'
  const receiptId = `x402_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
      `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address) VALUES ($1,$2,$3,$4,$4,'x402','paid',$5)`,
      [receiptId, x, y, priceUsd, payTo]
    )
  } catch (e) {
    console.error('[cells/purchase] grid_orders insert failed:', (e as Error)?.message)
  }

  let apiKey: string | null = null
  try {
    apiKey = await generateApiKey(x, y)
  } catch (e) {
    console.error('[cells/purchase] api key generation failed:', (e as Error)?.message)
  }

  await logEvent('purchase', { x, y, blockSize: '1×1', owner, message: `1×1 cell purchased at (${x},${y})` })

  // Referral: create code for buyer
  const refCode = await ensureRefCode(x, y)

  return NextResponse.json({ ok: true, cell: { x, y }, owner, receipt_id: receiptId, api_key: apiKey, ref_code: refCode })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cells/purchase',
    method: 'POST',
    price: priceStr,
    network: 'Base (eip155:8453)',
    payTo,
    cdp_auth: !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET),
    x402_ready: !!x402Handler,
    x402_error: x402InitError,
  })
}

export async function POST(req: NextRequest) {
  await initX402()
  if (x402InitError || !x402Handler) {
    return NextResponse.json({
      error: 'x402_unavailable',
      message: x402InitError || 'x402 handler not initialized',
      hint: 'Use Coinbase Commerce via the website instead'
    }, { status: 503 })
  }
  try {
    return await x402Handler(req)
  } catch (e: any) {
    console.error('[x402] handler error:', e)
    return NextResponse.json({
      error: 'x402_error',
      message: e?.message || 'x402 processing failed',
    }, { status: 500 })
  }
}
