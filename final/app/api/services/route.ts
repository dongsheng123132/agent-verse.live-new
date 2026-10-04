import { NextRequest, NextResponse } from 'next/server'
import { getMarketServices } from '../../../lib/market/market'
import { ensureSchema } from '../../../lib/schema'

// GET /api/services?q=&network=&max_price=&category=&status=
// Text-version service index for AI agents. Every entry is a service a cell
// owner listed (grid_cells.service_url) on a cell they bought; an empty list
// is a normal 200 with count 0. `status` is probe-only: can_pay | failed | unchecked.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: 'database_unavailable' }, { status: 503 })
    }
    try {
      await ensureSchema()
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: 'schema_unavailable', message: e?.message }, { status: 503 })
    }

    const url = new URL(req.url)
    const q = url.searchParams.get('q') || undefined
    const network = url.searchParams.get('network') || undefined
    const category = url.searchParams.get('category') || undefined
    const status = url.searchParams.get('status') || undefined
    const maxPriceRaw = url.searchParams.get('max_price')
    const max_price = maxPriceRaw !== null && maxPriceRaw !== '' ? Number(maxPriceRaw) : undefined

    const services = await getMarketServices({ q, network, category, status, max_price })
    return NextResponse.json({ ok: true, count: services.length, services })
  } catch (e: any) {
    console.error('[api/services]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
