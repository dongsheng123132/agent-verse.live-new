import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const x = Number(url.searchParams.get('x'))
    const y = Number(url.searchParams.get('y'))

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required' }, { status: 400 })
    }

    const res = await dbQuery(
      `SELECT id, x, y, owner_address as owner, fill_color as color,
              title, summary, image_url, iframe_url, content_url, markdown,
              block_id, block_w, block_h, block_origin_x, block_origin_y,
              hit_count, last_updated, scene_preset, scene_config
       FROM grid_cells WHERE x = $1 AND y = $2`,
      [x, y]
    )

    if (!res.rowCount) {
      return NextResponse.json({ ok: true, cell: null })
    }

    // Fire-and-forget hit increment on block origin (or single cell)
    if (res.rows[0].owner) {
      const row = res.rows[0]
      const ox = row.block_origin_x ?? x
      const oy = row.block_origin_y ?? y
      dbQuery('UPDATE grid_cells SET hit_count = COALESCE(hit_count, 0) + 1 WHERE x = $1 AND y = $2', [ox, oy]).catch(() => {})
    }

    return NextResponse.json({ ok: true, cell: res.rows[0] })
  } catch (e) {
    console.error('[cells]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
