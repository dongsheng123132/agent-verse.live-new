import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import { x402ResourceServer } from '@x402/core/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { registerExactEvmScheme } from '@x402/evm/exact/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'

const payTo = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000'
const facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402'
const priceUsd = process.env.PURCHASE_PRICE_USD || '2'
const priceStr = `$${priceUsd}`

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl })
const server = new x402ResourceServer(facilitatorClient)
registerExactEvmScheme(server, { networks: ['eip155:8453'] })

const routeConfig = {
  accepts: [{ scheme: 'exact', price: priceStr, network: 'eip155:8453', payTo }],
  description: `Purchase one grid cell (${priceStr} USDC on Base)`,
  mimeType: 'application/json',
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

  return NextResponse.json({ ok: true, cell: { x, y }, owner, receipt_id: receiptId, api_key: apiKey })
}

export const POST = withX402(purchaseHandler, routeConfig, server, undefined, undefined, false)
