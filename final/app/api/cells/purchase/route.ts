import { NextRequest, NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../../../app/types'
import { getSharedX402Server, getSharedX402Error } from '../../../../lib/x402-flow'
import { purchaseHandler } from './handler'

export async function GET() {
  if (!getSharedX402Error()) {
    getSharedX402Server().catch((e) => console.error('[x402] pre-warm failed:', e?.message))
  }
  return NextResponse.json({
    endpoint: '/api/cells/purchase',
    method: 'POST',
    price: `$${PRICE_PER_CELL.toFixed(2)}`,
    networks: ['Base (eip155:8453)', 'Monad (eip155:143)'],
    payTo: { base: process.env.TREASURY_ADDRESS || null, monad: process.env.MONAD_TREASURY_ADDRESS || null },
    x402_error: getSharedX402Error(),
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
