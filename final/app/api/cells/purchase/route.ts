import { NextRequest, NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../../../app/types'
import { describeOffer, getSharedX402Server, getSharedX402Error, getUnavailableX402Networks } from '../../../../lib/x402-flow'
import { purchaseHandler } from './handler'

export async function GET() {
  if (!getSharedX402Error()) {
    getSharedX402Server().catch((e) => console.error('[x402] pre-warm failed:', e?.message))
  }
  const offer = describeOffer(PRICE_PER_CELL)
  return NextResponse.json({
    endpoint: '/api/cells/purchase',
    method: 'POST',
    price: `$${PRICE_PER_CELL.toFixed(2)}`,
    networks: offer.networks,
    payTo: offer.payTo,
    x402_error: getSharedX402Error(),
    // networks whose facilitator is down right now (the 402 leaves them out and they are retried in the background)
    x402_unavailable_networks: getUnavailableX402Networks(),
  })
}

export async function POST(req: NextRequest) {
  try {
    return await purchaseHandler(req)
  } catch (e: any) {
    console.error('[cells/purchase] handler error:', e)
    return NextResponse.json({ error: 'internal_error', message: e?.message || 'purchase failed' }, { status: 500 })
  }
}
