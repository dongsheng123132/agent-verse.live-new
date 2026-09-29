import { NextRequest, NextResponse } from 'next/server'
import { getMarketServices, groupSellers } from '../../../lib/market/market'
import { ensureSchema } from '../../../lib/schema'

// GET /api/services?q=&network=&max_price=&category=&status=
// Text-version market for AI agents (MONAD-MARKET-SPEC.md P3). Combines
// officially-curated services (seed.json + Coinbase Bazaar, cached in
// market_services) and cell listings (grid_cells.service_url).
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
    // Seller-grouped view (MONAD-MARKET-SPEC.md honesty fix, 2026-09-30): the
    // same receiving wallet can front many interfaces (e.g. agent402's 15
    // tools sharing one payTo) and evidence is wallet-level, not
    // interface-level. `services` stays the flat list AI callers already
    // depend on; `sellers` is additive grouping info for /market's UI.
    const sellers = groupSellers(services, network)
    return NextResponse.json({ ok: true, count: services.length, services, sellers })
  } catch (e: any) {
    console.error('[api/services]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
