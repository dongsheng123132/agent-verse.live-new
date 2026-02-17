/**
 * x402 保护：买格子接口。未付 USDC 返回 402；付完后 Facilitator 验款通过则写库并返回。
 */
import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import { x402ResourceServer } from '@x402/core/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { registerExactEvmScheme } from '@x402/evm/exact/server'
import { dbQuery } from '../../../../lib/db.js'

const payTo = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000'
const facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402'
const priceUsd = process.env.PURCHASE_PRICE_USD || '2'
const priceStr = `$${priceUsd}`

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl })
const server = new x402ResourceServer(facilitatorClient)
registerExactEvmScheme(server, { networks: ['eip155:8453'] })

const routeConfig = {
  accepts: [{
    scheme: 'exact',
    price: priceStr,
    network: 'eip155:8453',
    payTo,
  }],
  description: `Purchase one grid cell (${priceStr} USDC on Base)`,
  mimeType: 'application/json',
}

async function purchaseHandler(req: NextRequest) {
  let x: number
  let y: number
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

  await dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
     VALUES ($1,$2,$3,$4,'HOLDING',false,NOW())
     ON CONFLICT (x, y) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       status = EXCLUDED.status,
       is_for_sale = false,
       last_updated = NOW()`,
    [cellId, x, y, owner]
  )

  try {
    await dbQuery(
      `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, treasury_address)
       VALUES ($1,$2,$3,$4,$5,'x402','paid',$6)`,
      [receiptId, x, y, priceUsd, priceUsd, payTo]
    )
  } catch (e) {
    console.error('[cells/purchase] grid_orders insert failed:', (e as Error)?.message)
  }

  return NextResponse.json({ ok: true, cell: { x, y }, owner, receipt_id: receiptId })
}

export const POST = withX402(purchaseHandler, routeConfig, server, undefined, undefined, false)
