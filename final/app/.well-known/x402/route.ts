import { NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../types'
import { BASE_NETWORK, MONAD_NETWORK, PAY_TO_ADDRESS } from '../../../lib/x402-flow'

// GET /.well-known/x402 — this site's own paid x402 endpoints (buy a cell,
// bulk-buy a block, recover an API key), for AI agents that discover
// services by well-known URL (MONAD-MARKET-SPEC.md P3).
export const dynamic = 'force-dynamic'

export async function GET() {
  const priceStr = `$${PRICE_PER_CELL.toFixed(2)}`
  const accepts = [BASE_NETWORK, MONAD_NETWORK].map((network) => ({ network, payTo: PAY_TO_ADDRESS, asset: 'USDC' }))

  return NextResponse.json({
    x402Version: 2,
    resources: [
      {
        resource: 'https://www.agent-verse.live/api/cells/purchase',
        method: 'POST',
        description: 'Buy one grid cell',
        price: priceStr,
        accepts,
      },
      {
        resource: 'https://www.agent-verse.live/api/cells/bulk-purchase',
        method: 'POST',
        description: `Buy up to 400 cells in one payment (${priceStr} per cell)`,
        price: `${priceStr} x cells.length`,
        accepts,
      },
      {
        resource: 'https://www.agent-verse.live/api/cells/regen-key',
        method: 'POST',
        description: "Recover a cell's API key (payer must be the cell's current owner)",
        price: priceStr,
        accepts,
      },
    ],
  })
}
