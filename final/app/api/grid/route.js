import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json([])
    const res = await dbQuery(
      `SELECT id, x, y, owner_address as owner, fill_color as color,
              title, summary, image_url,
              block_id, block_w, block_h, block_origin_x, block_origin_y,
              is_for_sale, price_usdc
       FROM grid_cells WHERE owner_address IS NOT NULL ORDER BY y, x`,
      []
    )
    return NextResponse.json(res.rows)
  } catch (e) {
    console.error('[api/grid]', e)
    return NextResponse.json([])
  }
}
