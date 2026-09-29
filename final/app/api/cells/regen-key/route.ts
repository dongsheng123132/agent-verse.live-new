import { NextRequest, NextResponse } from 'next/server'
import { PRICE_PER_CELL } from '../../../../app/types'
import { getSharedX402Server, getSharedX402Error } from '../../../../lib/x402-flow'
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
    description: `Pay ${regenPriceStr} USDC (Base or Monad) to recover your API key. Payer must be the cell's current owner.`,
    networks: ['Base (eip155:8453)', 'Monad (eip155:143)'],
    x402_error: getSharedX402Error(),
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
