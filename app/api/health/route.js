import { NextResponse } from 'next/server'

export async function GET(req) {
  const origin = req.nextUrl?.origin || ''
  const env = {
    treasury: !!process.env.TREASURY_ADDRESS,
    usdc: !!process.env.USDC_ADDRESS,
    rpc: !!process.env.RPC_URL
  }
  return NextResponse.json({ ok: true, origin, env })
}
