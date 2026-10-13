import { NextRequest, NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../../../app/types'
import { describeOffer, getSharedX402Server, getSharedX402Error, getUnavailableX402Networks } from '../../../../lib/x402-flow'
import { regenHandler } from './handler'

const regenPriceStr = `$${PRICE_PER_CELL.toFixed(2)}`

export async function GET() {
  if (!getSharedX402Error()) {
    getSharedX402Server().catch((e) => console.error('[regen-key] pre-warm failed:', e?.message))
  }
  return NextResponse.json({
    endpoint: '/api/cells/regen-key',
    method: 'POST',
    price: regenPriceStr,
    description: `Pay ${regenPriceStr} USDC on an offered network to recover your API key. Payer must be the cell's current owner.`,
    ...describeOffer(PRICE_PER_CELL),
    x402_error: getSharedX402Error(),
    // networks whose facilitator is down right now (the 402 leaves them out and they are retried in the background)
    x402_unavailable_networks: getUnavailableX402Networks(),
  })
}

export async function POST(req: NextRequest) {
  try {
    return await regenHandler(req)
  } catch (e: any) {
    console.error('[regen-key] handler error:', e)
    return NextResponse.json({ error: 'internal_error', message: e?.message || 'regen-key failed' }, { status: 500 })
  }
}
