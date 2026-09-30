import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'
import { ensureSchema } from '../../../lib/schema'
import { applyShowcaseToGridRows } from '../../../lib/showcase/index'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json([])
    // Self-heal: service_url/probe_status are new columns (MONAD-MARKET-SPEC.md
    // P2) that may not exist yet on a database no purchase/update route has
    // touched since deploy.
    await ensureSchema()
    const res = await dbQuery(
      `SELECT id, x, y, owner_address as owner, fill_color as color,
              title, summary, image_url,
              block_id, block_w, block_h, block_origin_x, block_origin_y,
              is_for_sale, price_usdc, service_url, probe_status
       FROM grid_cells WHERE owner_address IS NOT NULL ORDER BY y, x`,
      []
    )
    // Monad Metropolis showcase: virtual blocks merged in; real users' cells always win
    // (a block overlapping one is skipped and logged — lib/showcase/index.ts).
    return NextResponse.json(applyShowcaseToGridRows(res.rows))
  } catch (e) {
    console.error('[api/grid]', e)
    return NextResponse.json([])
  }
}
