import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await dbQuery(
      `SELECT x, y, owner_address as owner, title, image_url, fill_color, price_usdc, summary
       FROM grid_cells WHERE is_for_sale = true AND price_usdc > 0
       ORDER BY price_usdc ASC LIMIT 100`
    )
    const cells = (res.rows || []).map(r => ({
      x: r.x,
      y: r.y,
      owner: r.owner,
      title: r.title,
      image_url: r.image_url,
      fill_color: r.fill_color,
      price_usdc: Number(r.price_usdc),
      summary: r.summary,
    }))
    return NextResponse.json({ ok: true, cells })
  } catch (e) {
    console.error('[cells/for-sale]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
