import { NextRequest, NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../../../app/types'
import { getSharedX402Server, getSharedX402Error, getUnavailableX402Networks } from '../../../../lib/x402-flow'
import { bulkPurchaseHandler, MAX_CELLS_PER_REQUEST } from './handler'

export async function GET() {
  if (!getSharedX402Error()) {
    getSharedX402Server().catch((e) => console.error('[bulk-purchase] pre-warm failed:', e?.message))
  }
  return NextResponse.json({
    endpoint: '/api/cells/bulk-purchase',
    method: 'POST',
    body: '{ cells: [{x,y},...] }',
    pricing: `$${PRICE_PER_CELL.toFixed(2)} x cells.length`,
    max_cells: MAX_CELLS_PER_REQUEST,
    networks: ['Base (eip155:8453)', 'Monad (eip155:143)'],
    x402_error: getSharedX402Error(),
    // networks whose facilitator is down right now (the 402 leaves them out and they are retried in the background)
    x402_unavailable_networks: getUnavailableX402Networks(),
  })
}

export async function POST(req: NextRequest) {
  try {
    return await bulkPurchaseHandler(req)
  } catch (e: any) {
    console.error('[cells/bulk-purchase] handler error:', e)
    return NextResponse.json({ error: 'internal_error', message: e?.message || 'bulk purchase failed' }, { status: 500 })
  }
}
